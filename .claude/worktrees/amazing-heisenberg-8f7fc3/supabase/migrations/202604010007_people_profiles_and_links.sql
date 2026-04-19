begin;

create schema if not exists people;

-- Enums for profile model.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'people_profile_type') then
    create type people.people_profile_type as enum ('player', 'staff');
  end if;

  if not exists (select 1 from pg_type where typname = 'people_profile_status') then
    create type people.people_profile_status as enum ('draft', 'pending_claim', 'active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'people_profile_relationship_type') then
    create type people.people_profile_relationship_type as enum ('self', 'guardian', 'delegated_manager');
  end if;

  if not exists (select 1 from pg_type where typname = 'people_profile_invite_status') then
    create type people.people_profile_invite_status as enum ('none', 'pending', 'accepted', 'expired', 'cancelled');
  end if;
end
$$;

create table if not exists people.profiles (
  id uuid primary key default gen_random_uuid(),
  person_user_id uuid references auth.users(id) on delete set null,
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  profile_type people.people_profile_type not null,
  status people.people_profile_status not null default 'draft',
  display_name text not null,
  first_name text,
  last_name text,
  dob date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_profiles_display_name_nonempty check (char_length(trim(display_name)) > 0)
);

create table if not exists people.profile_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  account_user_id uuid references auth.users(id) on delete set null,
  profile_id uuid not null references people.profiles(id) on delete cascade,
  relationship_type people.people_profile_relationship_type not null,
  can_manage boolean not null default true,
  pending_invite_email text,
  invite_status people.people_profile_invite_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists people.profile_status_audit (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references people.profiles(id) on delete cascade,
  previous_status people.people_profile_status,
  next_status people.people_profile_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'system',
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists people_profiles_staff_per_user_org_uidx
  on people.profiles (org_id, person_user_id)
  where profile_type = 'staff';

create index if not exists people_profiles_org_idx on people.profiles (org_id, created_at desc);
create index if not exists people_profiles_person_idx on people.profiles (person_user_id, created_at desc);
create index if not exists people_profiles_type_status_idx on people.profiles (org_id, profile_type, status, created_at desc);
create index if not exists people_profiles_display_name_idx on people.profiles (org_id, lower(display_name));

create unique index if not exists people_profile_links_tuple_uidx
  on people.profile_links (org_id, account_user_id, profile_id, relationship_type);

create unique index if not exists people_profile_links_self_per_account_org_uidx
  on people.profile_links (org_id, account_user_id)
  where relationship_type = 'self' and account_user_id is not null;

create index if not exists people_profile_links_profile_idx on people.profile_links (profile_id, created_at desc);
create index if not exists people_profile_links_account_idx on people.profile_links (account_user_id, created_at desc);
create index if not exists people_profile_links_invite_idx on people.profile_links (invite_status, lower(pending_invite_email));

-- Transition guardrails.
create or replace function people.validate_profile_status_transition(
  input_previous people.people_profile_status,
  input_next people.people_profile_status
)
returns boolean
language sql
immutable
as $$
  select case
    when input_previous = input_next then true
    when input_previous = 'draft' and input_next in ('pending_claim', 'active', 'archived') then true
    when input_previous = 'pending_claim' and input_next in ('active', 'archived') then true
    when input_previous = 'active' and input_next in ('archived') then true
    when input_previous = 'archived' and input_next in ('active') then true
    else false
  end;
$$;

create or replace function people.profiles_enforce_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if not people.validate_profile_status_transition(old.status, new.status) then
      raise exception 'INVALID_PROFILE_STATUS_TRANSITION';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_enforce_status_transition on people.profiles;
create trigger profiles_enforce_status_transition
before update on people.profiles
for each row execute procedure people.profiles_enforce_status_transition();

create or replace function people.transition_profile_status(
  input_profile_id uuid,
  input_next_status people.people_profile_status,
  input_source text default 'manual',
  input_detail jsonb default '{}'::jsonb
)
returns people.profiles
language plpgsql
security definer
set search_path = public, people, orgs
as $$
declare
  current_row people.profiles%rowtype;
  actor_user_id uuid;
begin
  actor_user_id := auth.uid();

  select * into current_row
  from people.profiles
  where id = input_profile_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if actor_user_id is not null
     and not public.has_org_permission(current_row.org_id, 'people.write')
     and current_row.person_user_id <> actor_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if not people.validate_profile_status_transition(current_row.status, input_next_status) then
    raise exception 'INVALID_PROFILE_STATUS_TRANSITION';
  end if;

  if current_row.status is distinct from input_next_status then
    update people.profiles
    set status = input_next_status,
        updated_at = now()
    where id = current_row.id;

    insert into people.profile_status_audit (
      profile_id,
      previous_status,
      next_status,
      actor_user_id,
      source,
      detail_json
    )
    values (
      current_row.id,
      current_row.status,
      input_next_status,
      actor_user_id,
      coalesce(nullif(trim(input_source), ''), 'manual'),
      coalesce(input_detail, '{}'::jsonb)
    );
  end if;

  return (select p from people.profiles p where p.id = current_row.id);
end;
$$;

create or replace function public.transition_profile_status(
  input_profile_id uuid,
  input_next_status people.people_profile_status,
  input_source text default 'manual',
  input_detail jsonb default '{}'::jsonb
)
returns people.profiles
language sql
security definer
set search_path = public, people, orgs
as $$
  select people.transition_profile_status(input_profile_id, input_next_status, input_source, input_detail);
$$;

-- RLS policies.
alter table people.profiles enable row level security;
alter table people.profile_links enable row level security;
alter table people.profile_status_audit enable row level security;

drop policy if exists people_profiles_read on people.profiles;
create policy people_profiles_read on people.profiles
for select
using (
  public.has_org_permission(org_id, 'people.read')
  or person_user_id = auth.uid()
  or exists (
    select 1 from people.profile_links link
    where link.profile_id = people.profiles.id
      and link.account_user_id = auth.uid()
  )
);

drop policy if exists people_profiles_write on people.profiles;
create policy people_profiles_write on people.profiles
for all
using (
  public.has_org_permission(org_id, 'people.write')
  or person_user_id = auth.uid()
)
with check (
  public.has_org_permission(org_id, 'people.write')
  or person_user_id = auth.uid()
);

drop policy if exists people_profile_links_read on people.profile_links;
create policy people_profile_links_read on people.profile_links
for select
using (
  public.has_org_permission(org_id, 'people.read')
  or account_user_id = auth.uid()
  or exists (
    select 1 from people.profiles profile
    where profile.id = people.profile_links.profile_id
      and profile.person_user_id = auth.uid()
  )
);

drop policy if exists people_profile_links_write on people.profile_links;
create policy people_profile_links_write on people.profile_links
for all
using (
  public.has_org_permission(org_id, 'people.write')
  or account_user_id = auth.uid()
)
with check (
  public.has_org_permission(org_id, 'people.write')
  or account_user_id = auth.uid()
);

drop policy if exists people_profile_status_audit_read on people.profile_status_audit;
create policy people_profile_status_audit_read on people.profile_status_audit
for select
using (
  exists (
    select 1
    from people.profiles profile
    where profile.id = people.profile_status_audit.profile_id
      and (
        public.has_org_permission(profile.org_id, 'people.read')
        or profile.person_user_id = auth.uid()
      )
  )
);

-- Extend permission helper for people and participant role.
create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  with membership as (
    select membership.role
    from orgs.memberships membership
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
          'communications.write',
          'people.read',
          'people.write'
        ]::text[]
        when 'member' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read',
          'people.read'
        ]::text[]
        when 'participant' then array[
          'org.dashboard.read',
          'people.read'
        ]::text[]
        when 'user' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read',
          'people.read'
        ]::text[]
        when 'manager' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'calendar.read',
          'calendar.write',
          'events.read',
          'events.write',
          'people.read',
          'people.write'
        ]::text[]
        when 'owner' then array[
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
          'communications.write',
          'people.read',
          'people.write'
        ]::text[]
        else array[]::text[]
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
set search_path = public, orgs
as $$
  select case minimum_role
    when 'member' then public.has_org_permission(target_org_id, 'org.dashboard.read')
    when 'participant' then public.has_org_permission(target_org_id, 'org.dashboard.read')
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
      or public.has_org_permission(target_org_id, 'people.write')
    )
    else false
  end;
$$;

-- Backfill old players + guardian links into profiles + profile_links when legacy tables exist.
do $$
begin
  if to_regclass('people.players') is null or to_regclass('people.player_guardians') is null then
    return;
  end if;

  with seeded_profiles as (
    insert into people.profiles (
      person_user_id,
      org_id,
      profile_type,
      status,
      display_name,
      first_name,
      last_name,
      dob,
      metadata_json
    )
    select
      player.owner_user_id,
      membership.org_id,
      'player'::people.people_profile_type,
      'active'::people.people_profile_status,
      trim(concat_ws(' ', player.first_name, player.last_name)),
      player.first_name,
      player.last_name,
      player.date_of_birth,
      jsonb_strip_nulls(
        jsonb_build_object(
          'legacyPlayerId', player.id,
          'preferredName', player.preferred_name,
          'gender', player.gender,
          'jerseySize', player.jersey_size,
          'medicalNotes', player.medical_notes,
          'legacyMetadata', coalesce(player.metadata_json, '{}'::jsonb)
        )
      )
    from people.players player
    join orgs.memberships membership
      on membership.user_id = player.owner_user_id
    where not exists (
      select 1
      from people.profiles existing
      where existing.org_id = membership.org_id
        and existing.profile_type = 'player'
        and existing.person_user_id = player.owner_user_id
        and lower(existing.display_name) = lower(trim(concat_ws(' ', player.first_name, player.last_name)))
    )
    returning id, org_id, person_user_id, metadata_json
  ),
  profile_map as (
    select
      (seeded.metadata_json ->> 'legacyPlayerId')::uuid as legacy_player_id,
      seeded.id as profile_id,
      seeded.org_id,
      seeded.person_user_id
    from seeded_profiles seeded
    where seeded.metadata_json ? 'legacyPlayerId'
  )
  insert into people.profile_links (
    org_id,
    account_user_id,
    profile_id,
    relationship_type,
    can_manage,
    invite_status
  )
  select
    profile_map.org_id,
    profile_map.person_user_id,
    profile_map.profile_id,
    'self'::people.people_profile_relationship_type,
    true,
    'accepted'::people.people_profile_invite_status
  from profile_map
  on conflict do nothing;

  with profile_map as (
    select
      profile.id as profile_id,
      profile.org_id,
      (profile.metadata_json ->> 'legacyPlayerId')::uuid as legacy_player_id
    from people.profiles profile
    where profile.metadata_json ? 'legacyPlayerId'
  )
  insert into people.profile_links (
    org_id,
    account_user_id,
    profile_id,
    relationship_type,
    can_manage,
    invite_status
  )
  select
    profile_map.org_id,
    guardian.guardian_user_id,
    profile_map.profile_id,
    case
      when guardian.guardian_user_id = profile.person_user_id then 'self'::people.people_profile_relationship_type
      else 'guardian'::people.people_profile_relationship_type
    end,
    coalesce(guardian.can_manage, true),
    'accepted'::people.people_profile_invite_status
  from profile_map
  join people.player_guardians guardian
    on guardian.player_id = profile_map.legacy_player_id
  join people.profiles profile
    on profile.id = profile_map.profile_id
  on conflict do nothing;
end
$$;

commit;
