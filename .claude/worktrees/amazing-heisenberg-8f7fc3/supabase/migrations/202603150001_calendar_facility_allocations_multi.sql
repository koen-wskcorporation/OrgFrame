-- Enable multi-space allocations per occurrence and add rule-level facility allocations

-- Allow multiple allocations per occurrence
alter table public.calendar_occurrence_facility_allocations
  drop constraint if exists calendar_occurrence_facility_allocations_occurrence_id_key;

alter table public.calendar_occurrence_facility_allocations
  add constraint calendar_occurrence_facility_allocations_occurrence_space_key unique (occurrence_id, space_id);

-- Rule-level facility allocations
create table if not exists public.calendar_rule_facility_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid not null references public.calendar_rules(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  configuration_id uuid not null references public.facility_space_configurations(id) on delete restrict,
  lock_mode text not null default 'exclusive' check (lock_mode in ('exclusive', 'shared_invite_only')),
  allow_shared boolean not null default false,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, space_id)
);

create index if not exists calendar_rule_facility_allocations_org_rule_idx
  on public.calendar_rule_facility_allocations (org_id, rule_id, is_active);

create index if not exists calendar_rule_facility_allocations_org_space_idx
  on public.calendar_rule_facility_allocations (org_id, space_id, is_active);

create or replace function public.hydrate_calendar_rule_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rule_row record;
  configuration_row record;
begin
  select id, org_id, entry_id
  into rule_row
  from public.calendar_rules rule
  where rule.id = new.rule_id
  limit 1;

  if rule_row.id is null then
    raise exception 'CALENDAR_RULE_NOT_FOUND';
  end if;

  select id, org_id, space_id
  into configuration_row
  from public.facility_space_configurations configuration
  where configuration.id = new.configuration_id
  limit 1;

  if configuration_row.id is null then
    raise exception 'FACILITY_CONFIGURATION_NOT_FOUND';
  end if;

  if new.space_id <> configuration_row.space_id then
    raise exception 'FACILITY_CONFIGURATION_SPACE_MISMATCH';
  end if;

  if new.org_id is null then
    new.org_id = rule_row.org_id;
  end if;

  if new.org_id <> rule_row.org_id or new.org_id <> configuration_row.org_id then
    raise exception 'CALENDAR_RULE_ALLOCATION_ORG_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists calendar_rule_facility_allocations_set_updated_at on public.calendar_rule_facility_allocations;
create trigger calendar_rule_facility_allocations_set_updated_at
  before update on public.calendar_rule_facility_allocations
  for each row
  execute procedure public.set_updated_at();

drop trigger if exists calendar_rule_facility_allocations_hydrate on public.calendar_rule_facility_allocations;
create trigger calendar_rule_facility_allocations_hydrate
  before insert or update on public.calendar_rule_facility_allocations
  for each row
  execute procedure public.hydrate_calendar_rule_allocation();

alter table public.calendar_rule_facility_allocations enable row level security;

-- Policies

drop policy if exists calendar_rule_facility_allocations_select on public.calendar_rule_facility_allocations;
create policy calendar_rule_facility_allocations_select on public.calendar_rule_facility_allocations
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or exists (
      select 1
      from public.calendar_rules rule
      where rule.id = calendar_rule_facility_allocations.rule_id
        and public.has_calendar_entry_write(rule.entry_id)
    )
  );

drop policy if exists calendar_rule_facility_allocations_write on public.calendar_rule_facility_allocations;
create policy calendar_rule_facility_allocations_write on public.calendar_rule_facility_allocations
  for all
  using (
    exists (
      select 1
      from public.calendar_rules rule
      where rule.id = calendar_rule_facility_allocations.rule_id
        and public.has_calendar_entry_write(rule.entry_id)
    )
  )
  with check (
    exists (
      select 1
      from public.calendar_rules rule
      where rule.id = calendar_rule_facility_allocations.rule_id
        and public.has_calendar_entry_write(rule.entry_id)
    )
  );
