-- Repair migration: replays communications inbox foundation under a new version.
-- This is required when version 202603100001 was consumed by a different migration
-- in remote history, preventing the communications schema from being applied.
begin;

update public.org_custom_roles custom_role
set
  permissions = (
    select array_agg(distinct permission order by permission)
    from unnest(
      coalesce(custom_role.permissions, '{}'::text[])
      || array['communications.read', 'communications.write']::text[]
    ) as permission
  ),
  updated_at = now()
where true;

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select membership.role
    from public.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
    limit 1
  ),
  role_permissions as (
    select
      case membership.role
        when 'admin' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.branding.write',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'events.read',
          'events.write',
          'facilities.read',
          'facilities.write',
          'calendar.read',
          'calendar.write',
          'communications.read',
          'communications.write'
        ]::text[]
        when 'member' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from public.org_custom_roles custom_role
            where custom_role.org_id = target_org_id
              and custom_role.role_key = membership.role
            limit 1
          ),
          array[]::text[]
        )
      end as permissions
    from membership
  )
  select exists (
    select 1
    from role_permissions
    where required_permission = any(role_permissions.permissions)
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, minimum_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case minimum_role
    when 'member' then public.has_org_permission(target_org_id, 'org.dashboard.read')
    when 'admin' then public.has_org_permission(target_org_id, 'org.manage.read')
    when 'manager' then (
      public.has_org_permission(target_org_id, 'org.manage.read')
      or public.has_org_permission(target_org_id, 'org.pages.write')
      or public.has_org_permission(target_org_id, 'programs.write')
      or public.has_org_permission(target_org_id, 'forms.write')
      or public.has_org_permission(target_org_id, 'events.write')
      or public.has_org_permission(target_org_id, 'calendar.write')
      or public.has_org_permission(target_org_id, 'facilities.write')
      or public.has_org_permission(target_org_id, 'communications.write')
    )
    else false
  end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_comm_channel_type') then
    create type public.org_comm_channel_type as enum (
      'email',
      'sms',
      'facebook_messenger',
      'website_chat',
      'instagram',
      'whatsapp',
      'other'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_comm_resolution_status') then
    create type public.org_comm_resolution_status as enum ('resolved', 'unresolved', 'suggested', 'ignored');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_comm_message_direction') then
    create type public.org_comm_message_direction as enum ('inbound', 'outbound', 'system');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_comm_match_status') then
    create type public.org_comm_match_status as enum ('pending', 'accepted', 'rejected', 'expired', 'deferred');
  end if;
end
$$;

create table if not exists public.org_comm_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  first_name text,
  last_name text,
  primary_email text,
  primary_phone text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'unresolved', 'merged', 'archived')),
  source text not null default 'manual',
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  merged_into_contact_id uuid references public.org_comm_contacts(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_comm_contacts_display_name_nonempty check (char_length(trim(display_name)) > 0)
);

drop index if exists public.org_comm_contacts_org_auth_user_unique_idx;
create unique index if not exists org_comm_contacts_org_auth_user_unique_idx
  on public.org_comm_contacts (org_id, auth_user_id);
create index if not exists org_comm_contacts_org_display_idx on public.org_comm_contacts (org_id, display_name);
create index if not exists org_comm_contacts_org_email_idx on public.org_comm_contacts (org_id, lower(primary_email));
create index if not exists org_comm_contacts_org_phone_idx on public.org_comm_contacts (org_id, primary_phone);
create index if not exists org_comm_contacts_org_merged_idx on public.org_comm_contacts (org_id, merged_into_contact_id);

create table if not exists public.org_comm_channel_identities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid references public.org_comm_contacts(id) on delete set null,
  channel_type public.org_comm_channel_type not null,
  external_id text not null,
  external_username text,
  normalized_value text,
  display_label text,
  identity_metadata jsonb not null default '{}'::jsonb,
  is_verified boolean not null default false,
  linked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, channel_type, external_id)
);

create index if not exists org_comm_channel_identities_org_contact_idx
  on public.org_comm_channel_identities (org_id, contact_id, updated_at desc);
create index if not exists org_comm_channel_identities_org_channel_norm_idx
  on public.org_comm_channel_identities (org_id, channel_type, normalized_value);
create index if not exists org_comm_channel_identities_org_channel_external_idx
  on public.org_comm_channel_identities (org_id, channel_type, external_id);

create table if not exists public.org_comm_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  channel_type public.org_comm_channel_type not null,
  external_thread_id text,
  contact_id uuid references public.org_comm_contacts(id) on delete set null,
  channel_identity_id uuid references public.org_comm_channel_identities(id) on delete set null,
  resolution_status public.org_comm_resolution_status not null default 'unresolved',
  subject text,
  preview_text text,
  last_message_at timestamptz not null default now(),
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  conversation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists org_comm_conversations_org_channel_thread_unique_idx
  on public.org_comm_conversations (org_id, channel_type, external_thread_id)
  where external_thread_id is not null;
create index if not exists org_comm_conversations_org_last_message_idx
  on public.org_comm_conversations (org_id, last_message_at desc);
create index if not exists org_comm_conversations_org_resolution_idx
  on public.org_comm_conversations (org_id, resolution_status, last_message_at desc);
create index if not exists org_comm_conversations_org_channel_idx
  on public.org_comm_conversations (org_id, channel_type, last_message_at desc);
create index if not exists org_comm_conversations_org_contact_idx
  on public.org_comm_conversations (org_id, contact_id, last_message_at desc);
create index if not exists org_comm_conversations_org_identity_idx
  on public.org_comm_conversations (org_id, channel_identity_id, last_message_at desc);

create table if not exists public.org_comm_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid not null references public.org_comm_conversations(id) on delete cascade,
  contact_id uuid references public.org_comm_contacts(id) on delete set null,
  channel_identity_id uuid references public.org_comm_channel_identities(id) on delete set null,
  direction public.org_comm_message_direction not null,
  external_message_id text,
  body_text text not null default '',
  body_html text,
  attachments_json jsonb not null default '[]'::jsonb,
  sender_label text,
  sent_at timestamptz not null default now(),
  delivery_status text,
  message_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists org_comm_messages_org_conversation_external_unique_idx
  on public.org_comm_messages (org_id, conversation_id, external_message_id)
  where external_message_id is not null;
create index if not exists org_comm_messages_org_conversation_sent_idx
  on public.org_comm_messages (org_id, conversation_id, sent_at asc);
create index if not exists org_comm_messages_org_sent_idx
  on public.org_comm_messages (org_id, sent_at desc);
create index if not exists org_comm_messages_org_contact_idx
  on public.org_comm_messages (org_id, contact_id, sent_at desc);

create table if not exists public.org_comm_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid not null references public.org_comm_conversations(id) on delete cascade,
  channel_identity_id uuid not null references public.org_comm_channel_identities(id) on delete cascade,
  suggested_contact_id uuid not null references public.org_comm_contacts(id) on delete cascade,
  confidence_score integer not null check (confidence_score between 0 and 100),
  confidence_reason_codes jsonb not null default '[]'::jsonb,
  status public.org_comm_match_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  unique (org_id, conversation_id, channel_identity_id, suggested_contact_id)
);

create index if not exists org_comm_match_suggestions_org_conversation_idx
  on public.org_comm_match_suggestions (org_id, conversation_id, status, confidence_score desc);
create index if not exists org_comm_match_suggestions_org_identity_idx
  on public.org_comm_match_suggestions (org_id, channel_identity_id, status, confidence_score desc);

create table if not exists public.org_comm_contact_merge_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_contact_id uuid not null references public.org_comm_contacts(id) on delete restrict,
  target_contact_id uuid not null references public.org_comm_contacts(id) on delete restrict,
  performed_by_user_id uuid references auth.users(id) on delete set null,
  merge_strategy_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists org_comm_contact_merge_audit_org_created_idx
  on public.org_comm_contact_merge_audit (org_id, created_at desc);

create table if not exists public.org_comm_resolution_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid references public.org_comm_conversations(id) on delete cascade,
  channel_identity_id uuid references public.org_comm_channel_identities(id) on delete set null,
  contact_id uuid references public.org_comm_contacts(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists org_comm_resolution_events_org_conversation_idx
  on public.org_comm_resolution_events (org_id, conversation_id, created_at desc);
create index if not exists org_comm_resolution_events_org_contact_idx
  on public.org_comm_resolution_events (org_id, contact_id, created_at desc);

-- Updated-at triggers
drop trigger if exists org_comm_contacts_set_updated_at on public.org_comm_contacts;
create trigger org_comm_contacts_set_updated_at before update on public.org_comm_contacts for each row execute procedure public.set_updated_at();

drop trigger if exists org_comm_channel_identities_set_updated_at on public.org_comm_channel_identities;
create trigger org_comm_channel_identities_set_updated_at before update on public.org_comm_channel_identities for each row execute procedure public.set_updated_at();

drop trigger if exists org_comm_conversations_set_updated_at on public.org_comm_conversations;
create trigger org_comm_conversations_set_updated_at before update on public.org_comm_conversations for each row execute procedure public.set_updated_at();

drop trigger if exists org_comm_messages_set_updated_at on public.org_comm_messages;
create trigger org_comm_messages_set_updated_at before update on public.org_comm_messages for each row execute procedure public.set_updated_at();

alter table public.org_comm_contacts enable row level security;
alter table public.org_comm_channel_identities enable row level security;
alter table public.org_comm_conversations enable row level security;
alter table public.org_comm_messages enable row level security;
alter table public.org_comm_match_suggestions enable row level security;
alter table public.org_comm_contact_merge_audit enable row level security;
alter table public.org_comm_resolution_events enable row level security;

-- RLS policies

drop policy if exists org_comm_contacts_select on public.org_comm_contacts;
create policy org_comm_contacts_select on public.org_comm_contacts
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_contacts_write on public.org_comm_contacts;
create policy org_comm_contacts_write on public.org_comm_contacts
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

drop policy if exists org_comm_channel_identities_select on public.org_comm_channel_identities;
create policy org_comm_channel_identities_select on public.org_comm_channel_identities
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_channel_identities_write on public.org_comm_channel_identities;
create policy org_comm_channel_identities_write on public.org_comm_channel_identities
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

drop policy if exists org_comm_conversations_select on public.org_comm_conversations;
create policy org_comm_conversations_select on public.org_comm_conversations
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_conversations_write on public.org_comm_conversations;
create policy org_comm_conversations_write on public.org_comm_conversations
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

drop policy if exists org_comm_messages_select on public.org_comm_messages;
create policy org_comm_messages_select on public.org_comm_messages
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_messages_write on public.org_comm_messages;
create policy org_comm_messages_write on public.org_comm_messages
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

drop policy if exists org_comm_match_suggestions_select on public.org_comm_match_suggestions;
create policy org_comm_match_suggestions_select on public.org_comm_match_suggestions
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_match_suggestions_write on public.org_comm_match_suggestions;
create policy org_comm_match_suggestions_write on public.org_comm_match_suggestions
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

drop policy if exists org_comm_contact_merge_audit_select on public.org_comm_contact_merge_audit;
create policy org_comm_contact_merge_audit_select on public.org_comm_contact_merge_audit
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_contact_merge_audit_write on public.org_comm_contact_merge_audit;
create policy org_comm_contact_merge_audit_write on public.org_comm_contact_merge_audit
  for insert
  with check (public.has_org_permission(org_id, 'communications.write'));

drop policy if exists org_comm_resolution_events_select on public.org_comm_resolution_events;
create policy org_comm_resolution_events_select on public.org_comm_resolution_events
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_resolution_events_write on public.org_comm_resolution_events;
create policy org_comm_resolution_events_write on public.org_comm_resolution_events
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

-- Backfill contacts from org user accounts + submitters + registration-linked guardians/owners
with user_candidates as (
  select distinct membership.org_id, membership.user_id
  from public.org_memberships membership

  union

  select distinct submission.org_id, submission.submitted_by_user_id as user_id
  from public.org_form_submissions submission
  where submission.submitted_by_user_id is not null

  union

  select distinct registration.org_id, player.owner_user_id as user_id
  from public.program_registrations registration
  join public.players player on player.id = registration.player_id

  union

  select distinct registration.org_id, guardian.guardian_user_id as user_id
  from public.program_registrations registration
  join public.player_guardians guardian on guardian.player_id = registration.player_id
),
seed_rows as (
  select
    candidate.org_id,
    candidate.user_id,
    null::text as display_name,
    null::text as first_name,
    null::text as last_name,
    nullif(lower(trim(auth_user.email)), '') as email
  from user_candidates candidate
  join auth.users auth_user on auth_user.id = candidate.user_id
)
insert into public.org_comm_contacts (
  org_id,
  auth_user_id,
  display_name,
  first_name,
  last_name,
  primary_email,
  source,
  status,
  metadata_json
)
select
  seed.org_id,
  seed.user_id,
  coalesce(seed.display_name, seed.email, 'Account ' || left(seed.user_id::text, 8)) as display_name,
  seed.first_name,
  seed.last_name,
  seed.email,
  'backfill_account',
  'active',
  jsonb_build_object('backfill', true, 'seeded_at', now())
from seed_rows seed
on conflict (org_id, auth_user_id)
do update set
  display_name = excluded.display_name,
  first_name = coalesce(excluded.first_name, public.org_comm_contacts.first_name),
  last_name = coalesce(excluded.last_name, public.org_comm_contacts.last_name),
  primary_email = coalesce(excluded.primary_email, public.org_comm_contacts.primary_email),
  updated_at = now();

do $$
begin
  if to_regclass('public.user_profiles') is null then
    return;
  end if;

  update public.org_comm_contacts contact
  set
    first_name = coalesce(nullif(trim(profile.first_name), ''), contact.first_name),
    last_name = coalesce(nullif(trim(profile.last_name), ''), contact.last_name),
    display_name = coalesce(
      nullif(trim(concat_ws(' ', nullif(trim(profile.first_name), ''), nullif(trim(profile.last_name), ''))), ''),
      contact.display_name
    ),
    updated_at = now()
  from public.user_profiles profile
  where profile.user_id = contact.auth_user_id
    and contact.deleted_at is null;
end
$$;

insert into public.org_comm_channel_identities (
  org_id,
  contact_id,
  channel_type,
  external_id,
  normalized_value,
  display_label,
  is_verified,
  linked_at,
  identity_metadata
)
select
  contact.org_id,
  contact.id,
  'email'::public.org_comm_channel_type,
  lower(contact.primary_email),
  lower(contact.primary_email),
  contact.primary_email,
  true,
  now(),
  jsonb_build_object('source', 'contact_primary_email_backfill')
from public.org_comm_contacts contact
where contact.primary_email is not null
  and contact.deleted_at is null
on conflict (org_id, channel_type, external_id)
do update set
  contact_id = coalesce(public.org_comm_channel_identities.contact_id, excluded.contact_id),
  normalized_value = coalesce(excluded.normalized_value, public.org_comm_channel_identities.normalized_value),
  display_label = coalesce(public.org_comm_channel_identities.display_label, excluded.display_label),
  is_verified = public.org_comm_channel_identities.is_verified or excluded.is_verified,
  linked_at = coalesce(public.org_comm_channel_identities.linked_at, excluded.linked_at),
  updated_at = now();

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
  source_row public.org_comm_contacts%rowtype;
  target_row public.org_comm_contacts%rowtype;
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

  select *
  into source_row
  from public.org_comm_contacts
  where id = input_source_contact_id
    and org_id = input_org_id
  for update;

  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  select *
  into target_row
  from public.org_comm_contacts
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

  update public.org_comm_contacts
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
    select identity.id
    from public.org_comm_channel_identities identity
    where identity.org_id = input_org_id
      and identity.contact_id = input_source_contact_id
    for update
  loop
    begin
      update public.org_comm_channel_identities
      set
        contact_id = input_target_contact_id,
        linked_at = now(),
        updated_at = now()
      where id = identity_row.id;
    exception
      when unique_violation then
        delete from public.org_comm_channel_identities where id = identity_row.id;
    end;
  end loop;

  update public.org_comm_conversations
  set
    contact_id = input_target_contact_id,
    resolution_status = 'resolved',
    updated_at = now()
  where org_id = input_org_id
    and contact_id = input_source_contact_id;

  update public.org_comm_messages
  set
    contact_id = input_target_contact_id,
    updated_at = now()
  where org_id = input_org_id
    and contact_id = input_source_contact_id;

  update public.org_comm_match_suggestions
  set
    suggested_contact_id = input_target_contact_id
  where org_id = input_org_id
    and suggested_contact_id = input_source_contact_id
    and not exists (
      select 1
      from public.org_comm_match_suggestions duplicate
      where duplicate.org_id = org_comm_match_suggestions.org_id
        and duplicate.conversation_id = org_comm_match_suggestions.conversation_id
        and duplicate.channel_identity_id = org_comm_match_suggestions.channel_identity_id
        and duplicate.suggested_contact_id = input_target_contact_id
    );

  delete from public.org_comm_match_suggestions
  where org_id = input_org_id
    and suggested_contact_id = input_source_contact_id;

  update public.org_comm_resolution_events
  set contact_id = input_target_contact_id
  where org_id = input_org_id
    and contact_id = input_source_contact_id;

  update public.org_comm_contacts
  set
    auth_user_id = null,
    status = 'merged',
    merged_into_contact_id = input_target_contact_id,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
  where id = input_source_contact_id;

  insert into public.org_comm_contact_merge_audit (
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

  insert into public.org_comm_resolution_events (
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

  insert into public.audit_logs (
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
    'org_comm_contact',
    input_target_contact_id,
    jsonb_build_object('sourceContactId', input_source_contact_id, 'targetContactId', input_target_contact_id, 'strategy', coalesce(input_strategy, '{}'::jsonb))
  );

  return query select input_source_contact_id, input_target_contact_id, true;
end;
$$;

revoke all on function public.org_comm_merge_contacts(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.org_comm_merge_contacts(uuid, uuid, uuid, jsonb) to authenticated;

commit;
