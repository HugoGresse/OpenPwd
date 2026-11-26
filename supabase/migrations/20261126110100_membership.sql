create function private.log_audit(
    p_org_id uuid,
    p_entry_id uuid,
    p_entry_title text,
    p_action text,
    p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    v_actor_id uuid := auth.uid();
    v_actor_email text;
begin
    select email into v_actor_email from public.profiles where id = v_actor_id;

    insert into public.audit_log (
        org_id, entry_id, entry_title, actor_id, actor_email, action, detail, client_ip, user_agent
    )
    values (
        p_org_id,
        p_entry_id,
        p_entry_title,
        v_actor_id,
        coalesce(v_actor_email, 'unknown'),
        p_action,
        p_detail,
        left(v_headers ->> 'x-openpwd-client-ip', 64),
        left(v_headers ->> 'x-openpwd-user-agent', 256)
    );
end;
$$;

create function private.require_role(p_org_id uuid, p_roles public.org_role [])
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

-- Locks the organization first: two owners leaving at the same moment would otherwise both
-- see two owners and leave none.
create function private.owner_count(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_count integer;
begin
    perform 1 from public.organizations where id = p_org_id for update;

    select count(*)::integer into v_count
    from public.organization_members
    where org_id = p_org_id and role = 'owner';

    return v_count;
end;
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text := lower(new.email);
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, v_email, new.raw_user_meta_data ->> 'full_name');

    insert into public.audit_log (org_id, actor_id, actor_email, action, detail)
    select
        invites.org_id,
        new.id,
        v_email,
        'invite.claim',
        jsonb_build_object('role', invites.role)
    from public.organization_invites as invites
    where invites.email = v_email;

    insert into public.organization_members (org_id, user_id, role, added_by)
    select
        invites.org_id,
        new.id,
        invites.role,
        invites.invited_by
    from public.organization_invites as invites
    where invites.email = v_email;

    delete from public.organization_invites where email = v_email;

    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_org_id uuid;
begin
    if private.current_member_id() is null then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    insert into public.organizations (name, created_by)
    values (btrim(p_name), auth.uid())
    returning id into v_org_id;

    insert into public.organization_members (org_id, user_id, role, added_by)
    values (v_org_id, auth.uid(), 'owner', auth.uid());

    perform private.log_audit(v_org_id, null, null, 'org.create', jsonb_build_object('name', btrim(p_name)));

    return v_org_id;
end;
$$;

create function public.add_member(p_org_id uuid, p_email text, p_role public.org_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role := private.require_role(p_org_id, array['owner', 'admin']::public.org_role []);
    v_email text := lower(btrim(p_email));
    v_user_id uuid;
    v_invited_role public.org_role;
begin
    select role into v_invited_role
    from public.organization_invites
    where org_id = p_org_id and email = v_email;

    -- Only an owner may hand out ownership, or change an invite an owner made for one.
    if (p_role = 'owner' or v_invited_role = 'owner') and v_caller_role <> 'owner' then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    select id into v_user_id from public.profiles where email = v_email;

    if v_user_id is null then
        insert into public.organization_invites (org_id, email, role, invited_by)
        values (p_org_id, v_email, p_role, auth.uid())
        on conflict (org_id, email) do update set role = excluded.role, invited_by = excluded.invited_by;

        perform private.log_audit(
            p_org_id, null, null, 'invite.add', jsonb_build_object('email', v_email, 'role', p_role)
        );
        return 'invited';
    end if;

    insert into public.organization_members (org_id, user_id, role, added_by)
    values (p_org_id, v_user_id, p_role, auth.uid());

    perform private.log_audit(
        p_org_id, null, null, 'member.add', jsonb_build_object('email', v_email, 'role', p_role)
    );
    return 'added';
end;
$$;

create function public.set_member_role(p_org_id uuid, p_user_id uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role := private.require_role(p_org_id, array['owner', 'admin']::public.org_role []);
    v_current_role public.org_role;
begin
    select role into v_current_role
    from public.organization_members
    where org_id = p_org_id and user_id = p_user_id;

    if v_current_role is null then
        raise exception 'not_found' using errcode = 'P0002';
    end if;

    if (v_current_role = 'owner' or p_role = 'owner') and v_caller_role <> 'owner' then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    if v_current_role = 'owner' and p_role <> 'owner' and private.owner_count(p_org_id) <= 1 then
        raise exception 'last_owner' using errcode = 'P0001';
    end if;

    update public.organization_members
    set role = p_role
    where org_id = p_org_id and user_id = p_user_id;

    perform private.log_audit(
        p_org_id,
        null,
        null,
        'member.role',
        jsonb_build_object('user_id', p_user_id, 'from', v_current_role, 'to', p_role)
    );
end;
$$;

create function public.remove_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role := private.require_role(
        p_org_id, array['owner', 'admin', 'member']::public.org_role []
    );
    v_current_role public.org_role;
    v_email text;
begin
    select members.role, profiles.email into v_current_role, v_email
    from public.organization_members as members
    inner join public.profiles as profiles on members.user_id = profiles.id
    where members.org_id = p_org_id and members.user_id = p_user_id;

    if v_current_role is null then
        raise exception 'not_found' using errcode = 'P0002';
    end if;

    if p_user_id <> auth.uid() and v_caller_role = 'member' then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    if p_user_id <> auth.uid() and v_current_role = 'owner' and v_caller_role <> 'owner' then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    if v_current_role = 'owner' and private.owner_count(p_org_id) <= 1 then
        raise exception 'last_owner' using errcode = 'P0001';
    end if;

    delete from public.organization_members where org_id = p_org_id and user_id = p_user_id;

    perform private.log_audit(
        p_org_id, null, null, 'member.remove', jsonb_build_object('email', v_email, 'role', v_current_role)
    );
end;
$$;

create function public.remove_invite(p_org_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role := private.require_role(p_org_id, array['owner', 'admin']::public.org_role []);
    v_invited_role public.org_role;
begin
    select role into v_invited_role
    from public.organization_invites
    where org_id = p_org_id and email = lower(btrim(p_email));

    if v_invited_role is null then
        raise exception 'not_found' using errcode = 'P0002';
    end if;

    if v_invited_role = 'owner' and v_caller_role <> 'owner' then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    delete from public.organization_invites where org_id = p_org_id and email = lower(btrim(p_email));

    perform private.log_audit(
        p_org_id, null, null, 'invite.remove', jsonb_build_object('email', lower(btrim(p_email)))
    );
end;
$$;

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.add_member(uuid, text, public.org_role) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.org_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.remove_invite(uuid, text) to authenticated;
