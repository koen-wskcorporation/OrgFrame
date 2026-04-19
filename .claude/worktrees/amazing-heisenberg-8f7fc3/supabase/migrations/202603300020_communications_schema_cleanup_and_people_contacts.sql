begin;

create schema if not exists communications;
create schema if not exists people;

-- 1) Rename communications tables to remove org_comm_ prefix.
do $$
begin
  if to_regclass('communications.org_comm_channel_integrations') is not null and to_regclass('communications.channel_integrations') is null then
    execute 'alter table communications.org_comm_channel_integrations rename to channel_integrations';
  end if;

  if to_regclass('communications.org_comm_channel_identities') is not null and to_regclass('communications.channel_identities') is null then
    execute 'alter table communications.org_comm_channel_identities rename to channel_identities';
  end if;

  if to_regclass('communications.org_comm_conversations') is not null and to_regclass('communications.conversations') is null then
    execute 'alter table communications.org_comm_conversations rename to conversations';
  end if;

  if to_regclass('communications.org_comm_messages') is not null and to_regclass('communications.messages') is null then
    execute 'alter table communications.org_comm_messages rename to messages';
  end if;

  if to_regclass('communications.org_comm_resolution_events') is not null and to_regclass('communications.resolution_events') is null then
    execute 'alter table communications.org_comm_resolution_events rename to resolution_events';
  end if;
end
$$;

-- 2) Move contact-centric tables to people schema.
do $$
begin
  if to_regclass('communications.org_comm_contacts') is not null and to_regclass('people.contacts') is null then
    execute 'alter table communications.org_comm_contacts set schema people';
  end if;
  if to_regclass('people.org_comm_contacts') is not null and to_regclass('people.contacts') is null then
    execute 'alter table people.org_comm_contacts rename to contacts';
  end if;

  if to_regclass('communications.org_comm_match_suggestions') is not null and to_regclass('people.match_suggestions') is null then
    execute 'alter table communications.org_comm_match_suggestions set schema people';
  end if;
  if to_regclass('people.org_comm_match_suggestions') is not null and to_regclass('people.match_suggestions') is null then
    execute 'alter table people.org_comm_match_suggestions rename to match_suggestions';
  end if;

  if to_regclass('communications.org_comm_contact_merge_audit') is not null and to_regclass('people.contact_merge_audit') is null then
    execute 'alter table communications.org_comm_contact_merge_audit set schema people';
  end if;
  if to_regclass('people.org_comm_contact_merge_audit') is not null and to_regclass('people.contact_merge_audit') is null then
    execute 'alter table people.org_comm_contact_merge_audit rename to contact_merge_audit';
  end if;
end
$$;

-- 3) Merge integration secrets into channel_integrations.
alter table if exists communications.channel_integrations
  add column if not exists encrypted_access_token text,
  add column if not exists token_hint text;

do $$
begin
  if to_regclass('communications.org_comm_channel_integration_secrets') is not null then
    update communications.channel_integrations i
    set
      encrypted_access_token = coalesce(i.encrypted_access_token, s.encrypted_access_token),
      token_hint = coalesce(i.token_hint, s.token_hint),
      updated_at = now()
    from communications.org_comm_channel_integration_secrets s
    where s.integration_id = i.id
      and s.org_id = i.org_id;
  elsif to_regclass('communications.channel_integration_secrets') is not null then
    update communications.channel_integrations i
    set
      encrypted_access_token = coalesce(i.encrypted_access_token, s.encrypted_access_token),
      token_hint = coalesce(i.token_hint, s.token_hint),
      updated_at = now()
    from communications.channel_integration_secrets s
    where s.integration_id = i.id
      and s.org_id = i.org_id;
  end if;
end
$$;

drop table if exists communications.org_comm_channel_integration_secrets cascade;
drop table if exists communications.channel_integration_secrets cascade;

-- 4) Repoint contact foreign keys to people.contacts.
do $$
declare
  fk_name text;
begin
  if to_regclass('communications.channel_identities') is not null then
    for fk_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
      where n.nspname = 'communications'
        and t.relname = 'channel_identities'
        and c.contype = 'f'
        and a.attname = 'contact_id'
    loop
      execute format('alter table communications.channel_identities drop constraint %I', fk_name);
    end loop;

    execute 'alter table communications.channel_identities add constraint channel_identities_contact_id_fkey foreign key (contact_id) references people.contacts(id) on delete set null';
  end if;

  if to_regclass('communications.conversations') is not null then
    for fk_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
      where n.nspname = 'communications'
        and t.relname = 'conversations'
        and c.contype = 'f'
        and a.attname = 'contact_id'
    loop
      execute format('alter table communications.conversations drop constraint %I', fk_name);
    end loop;

    execute 'alter table communications.conversations add constraint conversations_contact_id_fkey foreign key (contact_id) references people.contacts(id) on delete set null';
  end if;

  if to_regclass('communications.messages') is not null then
    for fk_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
      where n.nspname = 'communications'
        and t.relname = 'messages'
        and c.contype = 'f'
        and a.attname = 'contact_id'
    loop
      execute format('alter table communications.messages drop constraint %I', fk_name);
    end loop;

    execute 'alter table communications.messages add constraint messages_contact_id_fkey foreign key (contact_id) references people.contacts(id) on delete set null';
  end if;

  if to_regclass('communications.resolution_events') is not null then
    for fk_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
      where n.nspname = 'communications'
        and t.relname = 'resolution_events'
        and c.contype = 'f'
        and a.attname = 'contact_id'
    loop
      execute format('alter table communications.resolution_events drop constraint %I', fk_name);
    end loop;

    execute 'alter table communications.resolution_events add constraint resolution_events_contact_id_fkey foreign key (contact_id) references people.contacts(id) on delete set null';
  end if;

  if to_regclass('people.match_suggestions') is not null then
    for fk_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
      where n.nspname = 'people'
        and t.relname = 'match_suggestions'
        and c.contype = 'f'
        and a.attname = 'suggested_contact_id'
    loop
      execute format('alter table people.match_suggestions drop constraint %I', fk_name);
    end loop;

    execute 'alter table people.match_suggestions add constraint match_suggestions_suggested_contact_id_fkey foreign key (suggested_contact_id) references people.contacts(id) on delete cascade';
  end if;

  if to_regclass('people.contact_merge_audit') is not null then
    for fk_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
      where n.nspname = 'people'
        and t.relname = 'contact_merge_audit'
        and c.contype = 'f'
        and a.attname in ('source_contact_id', 'target_contact_id')
    loop
      execute format('alter table people.contact_merge_audit drop constraint %I', fk_name);
    end loop;

    execute 'alter table people.contact_merge_audit add constraint contact_merge_audit_source_contact_id_fkey foreign key (source_contact_id) references people.contacts(id) on delete restrict';
    execute 'alter table people.contact_merge_audit add constraint contact_merge_audit_target_contact_id_fkey foreign key (target_contact_id) references people.contacts(id) on delete restrict';
  end if;
end
$$;

-- 5) Update merge function to new schemas/table names.
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

  update people.match_suggestions
  set suggested_contact_id = input_target_contact_id
  where org_id = input_org_id
    and suggested_contact_id = input_source_contact_id
    and not exists (
      select 1
      from people.match_suggestions duplicate
      where duplicate.org_id = people.match_suggestions.org_id
        and duplicate.conversation_id = people.match_suggestions.conversation_id
        and duplicate.channel_identity_id = people.match_suggestions.channel_identity_id
        and duplicate.suggested_contact_id = input_target_contact_id
    );

  delete from people.match_suggestions
  where org_id = input_org_id
    and suggested_contact_id = input_source_contact_id;

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

  insert into people.contact_merge_audit (
    org_id,
    source_contact_id,
    target_contact_id,
    performed_by_user_id,
    merge_strategy_json
  )
  values (
    input_org_id,
    input_source_contact_id,
    input_target_contact_id,
    actor_user_id,
    coalesce(input_strategy, '{}'::jsonb)
  );

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

-- 6) Grants for moved people tables and renamed communications tables.
grant usage on schema communications, people to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema communications to anon, authenticated;
grant select, insert, update, delete on all tables in schema people to anon, authenticated;
grant all privileges on all tables in schema communications to service_role;
grant all privileges on all tables in schema people to service_role;

alter default privileges in schema communications grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema communications grant all privileges on tables to service_role;
alter default privileges in schema people grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema people grant all privileges on tables to service_role;

commit;
