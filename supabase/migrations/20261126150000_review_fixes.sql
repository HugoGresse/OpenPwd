-- Fixes from the code review. A separate migration rather than an edit of the earlier files:
-- a database that already applied those would never see an edit.

-- 1. Membership changes of one organization run one at a time.
-- Every function below reads roles before deciding. Without this lock taken first, two
-- overlapping calls each decided on rows the other was changing: an organization could end
-- with no owner, and an admin could demote an owner or cancel an owner's invite.
-- NO KEY UPDATE, not UPDATE: the audit insert takes a key-share lock on the same row through
-- its foreign key, and must not wait on (or deadlock with) this one.
create function private.lock_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform 1 from public.organizations where id = p_org_id for no key update;
end;
$$;

create or replace function private.owner_count(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_count integer;
begin
    perform private.lock_organization(p_org_id);

    select count(*)::integer into v_count
    from public.organization_members
    where org_id = p_org_id and role = 'owner';

    return v_count;
end;
$$;

create or replace function public.add_member(p_org_id uuid, p_email text, p_role public.org_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role;
    v_email text := lower(btrim(p_email));
    v_user_id uuid;
    v_invited_role public.org_role;
begin
    -- The profile before the organization: deleting an account locks its profile first and the
    -- organizations it created second, and the opposite order here would deadlock with it.
    select id into v_user_id from public.profiles where email = v_email for key share;

    perform private.lock_organization(p_org_id);
    v_caller_role := private.require_role(p_org_id, array['owner', 'admin']::public.org_role []);

    select role into v_invited_role
    from public.organization_invites
    where org_id = p_org_id and email = v_email;

    -- Only an owner may hand out ownership, or change an invite an owner made for one.
    if (p_role = 'owner' or v_invited_role = 'owner') and v_caller_role <> 'owner' then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    -- A first sign-in that claimed an invite of this organization finished while we waited.
    if v_user_id is null then
        select id into v_user_id from public.profiles where email = v_email;
    end if;

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

create or replace function public.set_member_role(
    p_org_id uuid, p_user_id uuid, p_role public.org_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role;
    v_current_role public.org_role;
begin
    perform private.lock_organization(p_org_id);
    v_caller_role := private.require_role(p_org_id, array['owner', 'admin']::public.org_role []);

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

create or replace function public.remove_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role;
    v_current_role public.org_role;
    v_email text;
begin
    perform private.lock_organization(p_org_id);
    v_caller_role := private.require_role(
        p_org_id, array['owner', 'admin', 'member']::public.org_role []
    );

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

create or replace function public.remove_invite(p_org_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_role public.org_role;
    v_invited_role public.org_role;
begin
    perform private.lock_organization(p_org_id);
    v_caller_role := private.require_role(p_org_id, array['owner', 'admin']::public.org_role []);

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

-- A first sign-in claims its invites under the same lock. Without it, an invite revoked or
-- downgraded while the sign-up was in flight was claimed anyway, with its old role.
create or replace function private.handle_new_user()
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

    -- In a fixed order, so that two sign-ups invited to the same organizations cannot deadlock.
    perform private.lock_organization(invited.org_id)
    from (
        select org_id
        from public.organization_invites
        where email = v_email
        order by org_id
    ) as invited;

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

-- 2. Deleting an Auth user no longer removes memberships behind the functions' back.
-- The cascade skipped the last-owner rule and the audit log, and could leave an organization
-- that nobody was allowed to repair. The account must leave its organizations first.
alter table public.organization_members
drop constraint organization_members_user_id_fkey,
add constraint organization_members_user_id_fkey
foreign key (user_id) references public.profiles (id) on delete restrict;

-- 3. Every ciphertext remembers the KMS key that made it.
-- Decryption used the organization's current key, so pointing an organization (or the
-- deployment) at another key made every existing secret unreadable. NULL means "the key in
-- force for the organization", which is what rows written before this migration used.
alter table public.entries
add column kms_key_name text check (
    kms_key_name is null
    or (
        char_length(kms_key_name) <= 512
        and kms_key_name
        ~ '^projects/[a-z0-9-]+/locations/[a-z0-9-]+/keyRings/[A-Za-z0-9_-]+/cryptoKeys/[A-Za-z0-9_-]+$'
    )
);

alter table public.entry_versions
add column kms_key_name text;

-- Existing rows of an organization with its own key were encrypted with it. Those of an
-- organization on the deployment's default key stay NULL until their next edit: the database
-- does not know that default.
update public.entries
set kms_key_name = organizations.kms_key_name
from public.organizations
where
    entries.org_id = organizations.id
    and entries.kms_key_name is null
    and organizations.kms_key_name is not null;

update public.entry_versions
set kms_key_name = organizations.kms_key_name
from public.entries
inner join public.organizations on entries.org_id = organizations.id
where
    entry_versions.entry_id = entries.id
    and entry_versions.kms_key_name is null
    and organizations.kms_key_name is not null;

-- The added parameter has a default: the previous application version keeps working.
drop function public.create_entry(uuid, uuid, text, text, text, text [], boolean, text);

create function public.create_entry(
    p_entry_id uuid,
    p_org_id uuid,
    p_title text,
    p_url text,
    p_username text,
    p_field_labels text [],
    p_has_note boolean,
    p_ciphertext text,
    p_key_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.require_role(p_org_id, array['owner', 'admin', 'member']::public.org_role []);

    -- An id is used once, ever. Re-creating a deleted entry under its old id would restart the
    -- version counter and let superseded ciphertexts be replayed as current.
    if exists (select 1 from public.audit_log where entry_id = p_entry_id) then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    insert into public.entries (
        id,
        org_id,
        title,
        url,
        username,
        field_labels,
        has_note,
        secret_ciphertext,
        kms_key_name,
        created_by,
        updated_by
    )
    values (
        p_entry_id,
        p_org_id,
        btrim(p_title),
        nullif(btrim(p_url), ''),
        nullif(btrim(p_username), ''),
        p_field_labels,
        p_has_note,
        p_ciphertext,
        p_key_name,
        auth.uid(),
        auth.uid()
    );

    perform private.log_audit(p_org_id, p_entry_id, btrim(p_title), 'entry.create', '{}'::jsonb);
end;
$$;

drop function public.update_entry(uuid, text, text, text, text [], boolean, text, integer);

-- p_secret_version must be the stored version + 1: it is bound into the ciphertext as
-- authenticated data, and doubles as an optimistic lock against concurrent edits.
create function public.update_entry(
    p_entry_id uuid,
    p_title text,
    p_url text,
    p_username text,
    p_field_labels text [],
    p_has_note boolean,
    p_ciphertext text,
    p_secret_version integer,
    p_key_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_entry public.entries;
begin
    select * into v_entry from public.entries where id = p_entry_id for update;

    if v_entry.id is null then
        raise exception 'not_found' using errcode = 'P0002';
    end if;

    perform private.require_role(v_entry.org_id, array['owner', 'admin', 'member']::public.org_role []);

    if p_secret_version <> v_entry.secret_version + 1 then
        raise exception 'version_conflict' using errcode = 'P0001';
    end if;

    insert into public.entry_versions (
        entry_id, secret_version, secret_ciphertext, kms_key_name, replaced_by
    )
    values (
        v_entry.id, v_entry.secret_version, v_entry.secret_ciphertext, v_entry.kms_key_name, auth.uid()
    );

    update public.entries
    set
        title = btrim(p_title),
        url = nullif(btrim(p_url), ''),
        username = nullif(btrim(p_username), ''),
        field_labels = p_field_labels,
        has_note = p_has_note,
        secret_ciphertext = p_ciphertext,
        -- A caller that names no key re-encrypted with the key it was given by reveal_entry.
        kms_key_name = coalesce(p_key_name, v_entry.kms_key_name),
        secret_version = p_secret_version,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_entry_id;

    perform private.log_audit(
        v_entry.org_id,
        p_entry_id,
        btrim(p_title),
        'entry.update',
        jsonb_build_object('secret_version', p_secret_version)
    );
end;
$$;

-- The only way a ciphertext leaves the database. The audit row is written in the same
-- transaction, before the caller can ask KMS to decrypt anything.
create or replace function public.reveal_entry(p_entry_id uuid, p_action text, p_field text)
returns table (ciphertext text, version integer, key_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_entry public.entries;
    v_recent integer;
begin
    if p_action not in ('secret.view', 'secret.copy', 'secret.edit') then
        raise exception 'invalid_action' using errcode = '22023';
    end if;

    select * into v_entry from public.entries where id = p_entry_id;

    if v_entry.id is null or not private.is_org_member(v_entry.org_id) then
        raise exception 'not_found' using errcode = 'P0002';
    end if;

    -- One reveal at a time per member: parallel requests would otherwise all count the same
    -- committed rows and slip past the limit together.
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

    select count(*)::integer into v_recent
    from public.audit_log
    where
        actor_id = auth.uid()
        and action like 'secret.%'
        and created_at > now() - interval '1 minute';

    if v_recent >= 30 then
        raise exception 'rate_limited' using errcode = 'P0001';
    end if;

    perform private.log_audit(
        v_entry.org_id,
        v_entry.id,
        v_entry.title,
        p_action,
        jsonb_build_object('field', left(p_field, 120), 'secret_version', v_entry.secret_version)
    );

    update public.entries
    set last_accessed_by = auth.uid(), last_accessed_at = now()
    where id = p_entry_id;

    return query
    select
        v_entry.secret_ciphertext,
        v_entry.secret_version,
        coalesce(v_entry.kms_key_name, organizations.kms_key_name)
    from public.organizations as organizations
    where organizations.id = v_entry.org_id;
end;
$$;

grant execute on function public.create_entry(
    uuid, uuid, text, text, text, text [], boolean, text, text
) to authenticated;
grant execute on function public.update_entry(
    uuid, text, text, text, text [], boolean, text, integer, text
) to authenticated;

-- 4. The application can ask whether the database still honours its session.
-- A token keeps verifying after its session was signed out or grew too old: without this the
-- pages showed an empty vault to someone who looked signed in, instead of the sign-in page.
create function public.session_is_current()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select private.current_member_id() is not null;
$$;

grant execute on function public.session_is_current() to authenticated;
