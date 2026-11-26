create function public.create_entry(
    p_entry_id uuid,
    p_org_id uuid,
    p_title text,
    p_url text,
    p_username text,
    p_field_labels text [],
    p_has_note boolean,
    p_ciphertext text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform private.require_role(p_org_id, array['owner', 'admin', 'member']::public.org_role []);

    insert into public.entries (
        id, org_id, title, url, username, field_labels, has_note, secret_ciphertext, created_by, updated_by
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
        auth.uid(),
        auth.uid()
    );

    perform private.log_audit(p_org_id, p_entry_id, btrim(p_title), 'entry.create', '{}'::jsonb);
end;
$$;

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
    p_secret_version integer
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

    insert into public.entry_versions (entry_id, secret_version, secret_ciphertext, replaced_by)
    values (v_entry.id, v_entry.secret_version, v_entry.secret_ciphertext, auth.uid());

    update public.entries
    set
        title = btrim(p_title),
        url = nullif(btrim(p_url), ''),
        username = nullif(btrim(p_username), ''),
        field_labels = p_field_labels,
        has_note = p_has_note,
        secret_ciphertext = p_ciphertext,
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

create function public.delete_entry(p_entry_id uuid)
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

    delete from public.entries where id = p_entry_id;

    perform private.log_audit(v_entry.org_id, p_entry_id, v_entry.title, 'entry.delete', '{}'::jsonb);
end;
$$;

-- The only way a ciphertext leaves the database. The audit row is written in the same
-- transaction, before the caller can ask KMS to decrypt anything.
create function public.reveal_entry(p_entry_id uuid, p_action text, p_field text)
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
        organizations.kms_key_name
    from public.organizations as organizations
    where organizations.id = v_entry.org_id;
end;
$$;

grant execute on function public.create_entry(
    uuid, uuid, text, text, text, text [], boolean, text
) to authenticated;
grant execute on function public.update_entry(
    uuid, text, text, text, text [], boolean, text, integer
) to authenticated;
grant execute on function public.delete_entry(uuid) to authenticated;
grant execute on function public.reveal_entry(uuid, text, text) to authenticated;
