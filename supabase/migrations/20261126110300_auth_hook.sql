-- Runs inside Supabase Auth before any account is created. Fails closed: with no
-- allowed_email_domain setting, nobody can sign up.
-- For Google the hosted-domain claim of the ID token decides, not the email address alone: a
-- personal Google account can be registered on a company address.
-- Runs as supabase_auth_admin, without SECURITY DEFINER, as Supabase recommends for hooks.
grant usage on schema private to supabase_auth_admin;
grant select on private.instance_settings to supabase_auth_admin;

create function public.hook_before_user_created(event jsonb)
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

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
