begin;

-- Rename profiles table to users for a cleaner people schema.
alter table if exists people.user_profiles rename to users;

-- Drop contact matching/audit tables for now.
drop table if exists people.match_suggestions cascade;
drop table if exists people.contact_merge_audit cascade;

-- Keep merge RPC functional without suggestion/audit tables.
create or replace function public.org_comm_merge_contacts(
  input_org_id uuid,
  input_source_contact_id uuid,
  input_target_contact_id uuid,
  input_strategy jsonb default '{}'::jsonb
)
returns table (
  source_contact_id uuid,
  target_contact_id uuid,
  merged boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row people.contacts%rowtype;
  target_row people.contacts%rowtype;
  canonical_display_name text;
  canonical_first_name text;
  canonical_last_name text;
  canonical_primary_email text;
  canonical_primary_phone text;
  canonical_avatar_url text;
  canonical_notes text;
  actor_user_id uuid;
  identity_row record;
begin
  actor_user_id := auth.uid();

  if actor_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.has_org_permission(input_org_id, 'communications.write') then
    raise exception 'FORBIDDEN';
  end if;

  if input_source_contact_id = input_target_contact_id then
    raise exception 'SOURCE_EQUALS_TARGET';
  end if;

  select * into source_row
  from people.contacts
  where id = input_source_contact_id
    and org_id = input_org_id
  for update;

  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  select * into target_row
  from people.contacts
  where id = input_target_contact_id
    and org_id = input_org_id
  for update;

  if not found then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if source_row.merged_into_contact_id is not null then
    if source_row.merged_into_contact_id = input_target_contact_id then
      return query select input_source_contact_id, input_target_contact_id, true;
      return;
    end if;

    raise exception 'SOURCE_ALREADY_MERGED';
  end if;

  canonical_display_name := coalesce(nullif(trim(input_strategy ->> 'displayName'), ''), target_row.display_name, source_row.display_name);
  canonical_first_name := coalesce(nullif(trim(input_strategy ->> 'firstName'), ''), target_row.first_name, source_row.first_name);
  canonical_last_name := coalesce(nullif(trim(input_strategy ->> 'lastName'), ''), target_row.last_name, source_row.last_name);
  canonical_primary_email := coalesce(nullif(lower(trim(input_strategy ->> 'primaryEmail')), ''), target_row.primary_email, source_row.primary_email);
  canonical_primary_phone := coalesce(nullif(trim(input_strategy ->> 'primaryPhone'), ''), target_row.primary_phone, source_row.primary_phone);
  canonical_avatar_url := coalesce(nullif(trim(input_strategy ->> 'avatarUrl'), ''), target_row.avatar_url, source_row.avatar_url);
  canonical_notes := coalesce(nullif(trim(input_strategy ->> 'notes'), ''), target_row.notes, source_row.notes);

  update people.contacts
  set
    auth_user_id = coalesce(target_row.auth_user_id, source_row.auth_user_id),
    display_name = canonical_display_name,
    first_name = canonical_first_name,
    last_name = canonical_last_name,
    primary_email = canonical_primary_email,
    primary_phone = canonical_primary_phone,
    avatar_url = canonical_avatar_url,
    notes = canonical_notes,
    updated_at = now()
  where id = input_target_contact_id;

  for identity_row in
    select i.id
    from communications.channel_identities i
    where i.org_id = input_org_id
      and i.contact_id = input_source_contact_id
    for update
  loop
    begin
      update communications.channel_identities
      set contact_id = input_target_contact_id,
          linked_at = now(),
          updated_at = now()
      where id = identity_row.id;
    exception
      when unique_violation then
        delete from communications.channel_identities where id = identity_row.id;
    end;
  end loop;

  update communications.conversations
  set contact_id = input_target_contact_id,
      resolution_status = 'resolved',
      updated_at = now()
  where org_id = input_org_id
    and contact_id = input_source_contact_id;

  update communications.messages
  set contact_id = input_target_contact_id,
      updated_at = now()
  where org_id = input_org_id
    and contact_id = input_source_contact_id;

  update communications.resolution_events
  set contact_id = input_target_contact_id
  where org_id = input_org_id
    and contact_id = input_source_contact_id;

  update people.contacts
  set auth_user_id = null,
      status = 'merged',
      merged_into_contact_id = input_target_contact_id,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = input_source_contact_id;

  insert into communications.resolution_events (
    org_id,
    contact_id,
    actor_user_id,
    event_type,
    event_detail_json
  )
  values (
    input_org_id,
    input_target_contact_id,
    actor_user_id,
    'contact_merged',
    jsonb_build_object('sourceContactId', input_source_contact_id, 'targetContactId', input_target_contact_id, 'strategy', coalesce(input_strategy, '{}'::jsonb))
  );

  insert into ai.audit_logs (
    org_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    detail_json
  )
  values (
    input_org_id,
    actor_user_id,
    'communications.contact_merged',
    'comm_contact',
    input_target_contact_id,
    jsonb_build_object('sourceContactId', input_source_contact_id, 'targetContactId', input_target_contact_id, 'strategy', coalesce(input_strategy, '{}'::jsonb))
  );

  return query select input_source_contact_id, input_target_contact_id, true;
end;
$$;

revoke all on function public.org_comm_merge_contacts(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.org_comm_merge_contacts(uuid, uuid, uuid, jsonb) to authenticated;

commit;
