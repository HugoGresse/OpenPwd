-- Nothing in the public schema is reachable by API roles unless granted explicitly below.
alter default privileges for role postgres in schema public
revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
revoke execute on functions from anon, authenticated;
alter default privileges for role postgres
revoke execute on functions from public;

-- Index lint PG01 is silenced below: each index is built with its table, in one transaction.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.org_role as enum ('owner', 'admin', 'member');

create table private.instance_settings (
    key text primary key,
    value text not null
);

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    full_name text,
    created_at timestamptz not null default now()
);

create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 80),
    kms_key_name text,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create table public.organization_members (
    org_id uuid not null references public.organizations (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role public.org_role not null default 'member',
    added_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (org_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id); -- noqa: PG01

create table public.organization_invites (
    org_id uuid not null references public.organizations (id) on delete cascade,
    email text not null check (email = lower(email) and char_length(email) <= 320),
    role public.org_role not null default 'member',
    invited_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (org_id, email)
);

create table public.entries (
    id uuid primary key,
    org_id uuid not null references public.organizations (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 120),
    url text check (url is null or char_length(url) <= 2048),
    username text check (username is null or char_length(username) <= 320),
    field_labels text [] not null default '{}' check (cardinality(field_labels) <= 30),
    has_note boolean not null default false,
    secret_ciphertext text not null check (char_length(secret_ciphertext) <= 120000),
    secret_version integer not null default 1 check (secret_version >= 1),
    created_by uuid references public.profiles (id) on delete set null,
    updated_by uuid references public.profiles (id) on delete set null,
    last_accessed_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_accessed_at timestamptz
);

create index entries_org_id_idx on public.entries (org_id); -- noqa: PG01

create table public.entry_versions (
    entry_id uuid not null references public.entries (id) on delete cascade,
    secret_version integer not null,
    secret_ciphertext text not null,
    replaced_by uuid references public.profiles (id) on delete set null,
    replaced_at timestamptz not null default now(),
    primary key (entry_id, secret_version)
);

create table public.audit_log (
    id bigint generated always as identity primary key,
    org_id uuid not null references public.organizations (id),
    entry_id uuid,
    entry_title text,
    actor_id uuid,
    actor_email text not null,
    action text not null check (
        action in (
            'org.create',
            'member.add',
            'member.role',
            'member.remove',
            'invite.add',
            'invite.claim',
            'invite.remove',
            'entry.create',
            'entry.update',
            'entry.delete',
            'secret.view',
            'secret.copy',
            'secret.edit'
        )
    ),
    detail jsonb not null default '{}',
    client_ip text,
    user_agent text,
    created_at timestamptz not null default now()
);

create index audit_log_org_created_idx on public.audit_log (org_id, created_at desc); -- noqa: PG01
create index audit_log_actor_created_idx on public.audit_log (actor_id, created_at desc); -- noqa: PG01
create index audit_log_entry_idx on public.audit_log (entry_id); -- noqa: PG01

create function private.reject_audit_change()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_append_only
before update or delete on public.audit_log
for each row execute function private.reject_audit_change();

create trigger audit_log_no_truncate
before truncate on public.audit_log
for each statement execute function private.reject_audit_change();

create function private.setting(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select value from private.instance_settings where key = p_key;
$$;

-- A valid JWT is not enough: the session behind it must still exist, be recent, and have been
-- opened through Google.
-- * Signing out, or deleting the session, cuts access at once instead of at JWT expiry.
-- * Every Google re-authentication creates a new session, so a session older than the limit
--   belongs to someone who has stopped passing it (an account removed from the Workspace).
-- * A session opened any other way (a password set through the Auth API) is never accepted,
--   unless password login is switched on for local development.
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
            mins => coalesce(private.setting('max_session_minutes')::integer, 120)
        )
        and (
            private.setting('allow_password_login') is not distinct from 'true'
            or exists (
                select 1
                from auth.mfa_amr_claims as methods
                where methods.session_id = sessions.id and methods.authentication_method = 'oauth'
            )
        );
$$;

create function private.is_org_member(p_org_id uuid)
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

create function private.has_org_role(p_org_id uuid, p_roles public.org_role [])
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

create function private.shares_org_with(p_user_id uuid)
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

grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.org_role []) to authenticated;
grant execute on function private.shares_org_with(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;
alter table public.entries enable row level security;
alter table public.entry_versions enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (id = (select auth.uid()) or private.shares_org_with(id));

create policy organizations_select on public.organizations
for select to authenticated
using (private.is_org_member(id));

create policy organization_members_select on public.organization_members
for select to authenticated
using (private.is_org_member(org_id));

create policy organization_invites_select on public.organization_invites
for select to authenticated
using (private.has_org_role(org_id, array['owner', 'admin']::public.org_role []));

create policy entries_select on public.entries
for select to authenticated
using (private.is_org_member(org_id));

create policy audit_log_select on public.audit_log
for select to authenticated
using (private.has_org_role(org_id, array['owner', 'admin']::public.org_role []));

-- Every write goes through the audited functions of the next migration: API roles only read.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant select (id, name, kms_key_name, created_by, created_at) on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.organization_invites to authenticated;
grant select on public.audit_log to authenticated;
-- secret_ciphertext is deliberately absent: it only leaves through reveal_entry().
grant select (
    id,
    org_id,
    title,
    url,
    username,
    field_labels,
    has_note,
    secret_version,
    created_by,
    updated_by,
    last_accessed_by,
    created_at,
    updated_at,
    last_accessed_at
) on public.entries to authenticated;
