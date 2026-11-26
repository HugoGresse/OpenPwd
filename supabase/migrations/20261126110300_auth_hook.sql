-- Runs inside Supabase Auth before any account is created. Fails closed: with no
-- allowed_email_domain setting, nobody can sign up.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text := lower(event -> 'user' ->> 'email');
    v_provider text := event -> 'user' -> 'app_metadata' ->> 'provider';
    v_allowed_domain text;
    v_allow_password text;
begin
    select value into v_allowed_domain
    from private.instance_settings
    where key = 'allowed_email_domain';

    select value into v_allow_password
    from private.instance_settings
    where key = 'allow_password_login';

    if v_provider is distinct from 'google' and v_allow_password is distinct from 'true' then
        return jsonb_build_object(
            'error', jsonb_build_object('http_code', 403, 'message', 'Only Google sign-in is allowed')
        );
    end if;

    if
        v_allowed_domain is null
        or v_email is null
        or split_part(v_email, '@', 2) <> lower(v_allowed_domain)
    then
        return jsonb_build_object(
            'error', jsonb_build_object('http_code', 403, 'message', 'This account is not allowed')
        );
    end if;

    return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
