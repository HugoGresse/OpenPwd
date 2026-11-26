-- A valid JWT is not enough: the session behind it must still exist and be recent.
-- * Signing out, or deleting the session, cuts access at once instead of at JWT expiry.
-- * A member who can no longer pass Google sign-in (account removed from the Workspace) cannot
--   keep an old session alive by refreshing it: every Google re-authentication creates a new
--   session, so a session older than the limit belongs to someone who has stopped passing it.
-- Hosted Supabase only offers session time-boxing on paid plans; this works on every plan.
create function private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select sessions.user_id
    from auth.sessions as sessions
    where
        sessions.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
        and sessions.user_id = (select auth.uid())
        and sessions.created_at > now() - make_interval(
            mins => coalesce(
                (
                    select settings.value::integer
                    from private.instance_settings as settings
                    where settings.key = 'max_session_minutes'
                ),
                120
            )
        );
$$;

create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_members
        where org_id = p_org_id and user_id = private.current_member_id()
    );
$$;

create or replace function private.has_org_role(p_org_id uuid, p_roles public.org_role [])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_members
        where
            org_id = p_org_id
            and user_id = private.current_member_id()
            and role = any(p_roles)
    );
$$;

create or replace function private.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_members as mine
        inner join public.organization_members as theirs on mine.org_id = theirs.org_id
        where mine.user_id = private.current_member_id() and theirs.user_id = p_user_id
    );
$$;

create or replace function private.require_role(p_org_id uuid, p_roles public.org_role [])
returns public.org_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_role public.org_role;
begin
    select role into v_role
    from public.organization_members
    where org_id = p_org_id and user_id = private.current_member_id();

    if v_role is null or not (v_role = any(p_roles)) then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    return v_role;
end;
$$;

create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_member_id uuid := private.current_member_id();
    v_org_id uuid;
begin
    if v_member_id is null then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    insert into public.organizations (name, created_by)
    values (btrim(p_name), v_member_id)
    returning id into v_org_id;

    insert into public.organization_members (org_id, user_id, role, added_by)
    values (v_org_id, v_member_id, 'owner', v_member_id);

    perform private.log_audit(v_org_id, null, null, 'org.create', jsonb_build_object('name', btrim(p_name)));

    return v_org_id;
end;
$$;

-- Sign-up gate. For Google the hosted-domain claim of the ID token decides, not the email
-- address: a personal Google account can be registered on a company address.
-- Runs as supabase_auth_admin (no SECURITY DEFINER, as Supabase recommends for hooks).
grant usage on schema private to supabase_auth_admin;
grant select on private.instance_settings to supabase_auth_admin;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_email text := lower(event -> 'user' ->> 'email');
    v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
    v_hosted_domain text := lower(event -> 'user' -> 'user_metadata' -> 'custom_claims' ->> 'hd');
    v_allowed_domain text;
    v_allow_password text;
    v_refusal jsonb := jsonb_build_object(
        'error', jsonb_build_object('http_code', 403, 'message', 'This account is not allowed')
    );
begin
    select lower(value) into v_allowed_domain
    from private.instance_settings
    where key = 'allowed_email_domain';

    select value into v_allow_password
    from private.instance_settings
    where key = 'allow_password_login';

    if v_allowed_domain is null or v_email is null then
        return v_refusal;
    end if;

    if split_part(v_email, '@', 2) <> v_allowed_domain then
        return v_refusal;
    end if;

    if v_provider = 'google' then
        if v_hosted_domain is distinct from v_allowed_domain then
            return v_refusal;
        end if;
    elsif v_allow_password is distinct from 'true' then
        return v_refusal;
    end if;

    return '{}'::jsonb;
end;
$$;
