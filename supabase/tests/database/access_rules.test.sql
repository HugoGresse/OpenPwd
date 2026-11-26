begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into private.instance_settings (key, value)
values ('max_session_minutes', '120')
on conflict (key) do update set value = excluded.value;

-- Acts as a member holding a session of the given age (minutes).
create function pg_temp.act_as(p_user_id uuid, p_session_age integer default 1)
returns void
language plpgsql
as $$
declare
    v_session_id uuid := gen_random_uuid();
begin
    perform set_config('role', 'postgres', true);
    insert into auth.sessions (id, user_id, created_at)
    values (v_session_id, p_user_id, now() - make_interval(mins => p_session_age));

    perform set_config('role', 'authenticated', true);
    perform set_config(
        'request.jwt.claims',
        json_build_object('sub', p_user_id, 'role', 'authenticated', 'session_id', v_session_id)::text,
        true
    );
end;
$$;

create function pg_temp.act_as_admin()
returns void
language plpgsql
as $$
begin
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email, aud, role)
values
('00000000-0000-0000-0000-00000000000a', 'Alice@example.org', 'authenticated', 'authenticated'),
('00000000-0000-0000-0000-00000000000b', 'bob@example.org', 'authenticated', 'authenticated');

grant execute on function pg_temp.act_as(uuid, integer) to authenticated;
grant execute on function pg_temp.act_as_admin() to authenticated;

select is(
    (
        select email
        from public.profiles
        where id = '00000000-0000-0000-0000-00000000000a'
    ),
    'alice@example.org',
    'signing up creates a profile with a lower-cased email'
);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');

create temporary table ctx on commit drop as
select public.create_organization('Treasury') as org_id;
grant select on ctx to authenticated;

select is(
    (
        select role::text
        from public.organization_members
        where user_id = '00000000-0000-0000-0000-00000000000a'
    ),
    'owner',
    'the creator of an organization becomes its owner'
);

select lives_ok(
    $$
        select public.create_entry(
            '00000000-0000-0000-0000-0000000000e1',
            (select org_id from ctx),
            'Bank portal', 'https://bank.example', 'treasurer', array['PIN'], true, 'cipher-v1'
        )
    $$,
    'a member can create an entry'
);

select throws_ok(
    'select secret_ciphertext from public.entries',
    '42501',
    null,
    'the ciphertext column cannot be selected directly, even by a member'
);

select throws_ok(
    $$insert into public.entries (id, org_id, title, secret_ciphertext)
      values (gen_random_uuid(), (select org_id from ctx), 'x', 'y')$$,
    '42501',
    null,
    'entries cannot be written outside the audited functions'
);

select is(
    (
        select ciphertext
        from public.reveal_entry('00000000-0000-0000-0000-0000000000e1', 'secret.copy', 'password')
    ),
    'cipher-v1',
    'reveal_entry returns the ciphertext to a member'
);

select is(
    (
        select count(*)::integer
        from public.audit_log
        where action = 'secret.copy' and entry_id = '00000000-0000-0000-0000-0000000000e1'
    ),
    1,
    'every reveal writes an audit row'
);

select isnt(
    (
        select last_accessed_at
        from public.entries
        where id = '00000000-0000-0000-0000-0000000000e1'
    ),
    null,
    'a reveal records the last access'
);

select throws_ok(
    $$select * from public.reveal_entry('00000000-0000-0000-0000-0000000000e1', 'entry.delete', 'x')$$,
    '22023',
    null,
    'reveal_entry rejects actions that are not secret accesses'
);

select throws_ok(
    'update public.audit_log set actor_email = ''someone@else.org''',
    '42501',
    null,
    'API roles cannot update the audit log'
);

select throws_ok(
    'delete from public.audit_log',
    '42501',
    null,
    'API roles cannot delete from the audit log'
);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');

select is(
    (select count(*)::integer from public.organizations),
    0,
    'a non-member sees no organization'
);

select is(
    (select count(*)::integer from public.entries),
    0,
    'a non-member sees no entry'
);

select throws_ok(
    $$select * from public.reveal_entry('00000000-0000-0000-0000-0000000000e1', 'secret.view', 'password')$$,
    'P0002',
    null,
    'a non-member cannot reveal an entry'
);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');

select is(
    public.add_member((select org_id from ctx), 'BOB@example.org', 'member'),
    'added',
    'an owner can add an existing user'
);

select is(
    public.add_member((select org_id from ctx), 'carol@example.org', 'admin'),
    'invited',
    'adding an unknown email creates an invite'
);

select throws_ok(
    $$select public.remove_member((select org_id from ctx), '00000000-0000-0000-0000-00000000000a')$$,
    'P0001',
    'last_owner',
    'the last owner cannot leave'
);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');

select is(
    (select count(*)::integer from public.entries),
    1,
    'a member sees the entries of the organization'
);

select throws_ok(
    $$select public.add_member((select org_id from ctx), 'dave@example.org', 'member')$$,
    '42501',
    null,
    'a plain member cannot add members'
);

select is(
    (select count(*)::integer from public.audit_log),
    0,
    'a plain member cannot read the audit log'
);

select throws_ok(
    $$
        select public.update_entry(
            '00000000-0000-0000-0000-0000000000e1',
            'Bank portal', null, null, array[]::text[], false, 'cipher-v5', 5
        )
    $$,
    'P0001',
    'version_conflict',
    'an update with the wrong secret version is rejected'
);

select lives_ok(
    $$
        select public.update_entry(
            '00000000-0000-0000-0000-0000000000e1',
            'Bank portal', null, null, array[]::text[], false, 'cipher-v2', 2
        )
    $$,
    'an update with the next secret version is accepted'
);

select pg_temp.act_as('00000000-0000-0000-0000-00000000000a', 121);

select is(
    (select count(*)::integer from public.organizations),
    0,
    'a session older than the limit sees no organization'
);

select throws_ok(
    $$select * from public.reveal_entry('00000000-0000-0000-0000-0000000000e1', 'secret.view', 'password')$$,
    'P0002',
    null,
    'a session older than the limit cannot reveal an entry'
);

select throws_ok(
    $$select public.create_organization('Stale')$$,
    '42501',
    null,
    'a session older than the limit cannot create an organization'
);

select pg_temp.act_as_admin();
delete from auth.sessions
where user_id = '00000000-0000-0000-0000-00000000000a';
select set_config('role', 'authenticated', true);

select is(
    (select count(*)::integer from public.entries),
    0,
    'a token whose session was signed out sees nothing, even before the token expires'
);

select pg_temp.act_as_admin();

select is(
    public.hook_before_user_created(
        '{"user": {"email": "jo@example.org", "app_metadata": {"provider": "google"},
          "user_metadata": {"custom_claims": {"hd": "example.org"}}}}'::jsonb
    ),
    '{}'::jsonb,
    'the sign-up hook accepts a Workspace account of the allowed domain'
);

select is(
    public.hook_before_user_created(
        '{"user": {"email": "jo@example.org", "app_metadata": {"provider": "google"},
          "user_metadata": {}}}'::jsonb
    ) -> 'error' ->> 'http_code',
    '403',
    'the sign-up hook refuses a personal Google account on a company address'
);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000000c', 'carol@example.org', 'authenticated', 'authenticated');

select is(
    (
        select role::text
        from public.organization_members
        where user_id = '00000000-0000-0000-0000-00000000000c'
    ),
    'admin',
    'an invite is claimed with its role at first sign-in'
);

select throws_ok(
    'delete from public.audit_log',
    'P0001',
    'audit_log is append-only',
    'even the database owner is stopped by the append-only trigger'
);

select finish();

rollback;
