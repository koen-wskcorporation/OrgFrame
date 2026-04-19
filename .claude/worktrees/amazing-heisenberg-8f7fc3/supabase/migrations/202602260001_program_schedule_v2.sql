begin;

create table if not exists public.program_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  program_node_id uuid references public.program_nodes(id) on delete set null,
  mode text not null check (mode in ('single_date', 'multiple_specific_dates', 'repeating_pattern', 'continuous_date_range', 'custom_advanced')),
  title text,
  timezone text not null,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  interval_count integer not null default 1 check (interval_count > 0),
  interval_unit text check (interval_unit in ('day', 'week', 'month')),
  by_weekday smallint[],
  by_monthday smallint[],
  end_mode text not null default 'until_date' check (end_mode in ('never', 'until_date', 'after_occurrences')),
  until_date date,
  max_occurrences integer check (max_occurrences is null or max_occurrences > 0),
  sort_index integer not null default 0,
  is_active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  rule_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_schedule_rules_date_window_valid check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

create table if not exists public.program_occurrences (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  program_node_id uuid references public.program_nodes(id) on delete set null,
  source_rule_id uuid references public.program_schedule_rules(id) on delete set null,
  source_type text not null check (source_type in ('rule', 'manual', 'override')),
  source_key text not null,
  title text,
  timezone text not null,
  local_date date not null,
  local_start_time time,
  local_end_time time,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, source_key),
  constraint program_occurrences_window_valid check (ends_at_utc > starts_at_utc)
);

create table if not exists public.program_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  rule_id uuid not null references public.program_schedule_rules(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('skip', 'override')),
  override_occurrence_id uuid references public.program_occurrences(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, rule_id, source_key)
);

create index if not exists program_schedule_rules_program_sort_idx on public.program_schedule_rules (program_id, sort_index, created_at);
create index if not exists program_schedule_rules_program_active_idx on public.program_schedule_rules (program_id, is_active, updated_at desc);
create index if not exists program_occurrences_program_time_idx on public.program_occurrences (program_id, starts_at_utc, status);
create index if not exists program_occurrences_rule_idx on public.program_occurrences (source_rule_id, starts_at_utc) where source_rule_id is not null;
create index if not exists program_occurrences_node_idx on public.program_occurrences (program_node_id, starts_at_utc) where program_node_id is not null;
create index if not exists program_schedule_exceptions_rule_idx on public.program_schedule_exceptions (rule_id, source_key);

drop trigger if exists program_schedule_rules_set_updated_at on public.program_schedule_rules;
create trigger program_schedule_rules_set_updated_at before update on public.program_schedule_rules for each row execute procedure public.set_updated_at();

drop trigger if exists program_occurrences_set_updated_at on public.program_occurrences;
create trigger program_occurrences_set_updated_at before update on public.program_occurrences for each row execute procedure public.set_updated_at();

drop trigger if exists program_schedule_exceptions_set_updated_at on public.program_schedule_exceptions;
create trigger program_schedule_exceptions_set_updated_at before update on public.program_schedule_exceptions for each row execute procedure public.set_updated_at();

alter table public.program_schedule_rules enable row level security;
alter table public.program_occurrences enable row level security;
alter table public.program_schedule_exceptions enable row level security;

drop policy if exists program_schedule_rules_public_or_read on public.program_schedule_rules;
create policy program_schedule_rules_public_or_read on public.program_schedule_rules
  for select
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_rules.program_id
        and (
          program.status = 'published'
          or public.has_org_permission(program.org_id, 'programs.read')
        )
    )
  );

drop policy if exists program_schedule_rules_write on public.program_schedule_rules;
create policy program_schedule_rules_write on public.program_schedule_rules
  for all
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_rules.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  )
  with check (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_rules.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  );

drop policy if exists program_occurrences_public_or_read on public.program_occurrences;
create policy program_occurrences_public_or_read on public.program_occurrences
  for select
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_occurrences.program_id
        and (
          program.status = 'published'
          or public.has_org_permission(program.org_id, 'programs.read')
        )
    )
  );

drop policy if exists program_occurrences_write on public.program_occurrences;
create policy program_occurrences_write on public.program_occurrences
  for all
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_occurrences.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  )
  with check (
    exists (
      select 1
      from public.programs program
      where program.id = program_occurrences.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  );

drop policy if exists program_schedule_exceptions_public_or_read on public.program_schedule_exceptions;
create policy program_schedule_exceptions_public_or_read on public.program_schedule_exceptions
  for select
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_exceptions.program_id
        and (
          program.status = 'published'
          or public.has_org_permission(program.org_id, 'programs.read')
        )
    )
  );

drop policy if exists program_schedule_exceptions_write on public.program_schedule_exceptions;
create policy program_schedule_exceptions_write on public.program_schedule_exceptions
  for all
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_exceptions.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  )
  with check (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_exceptions.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  );

commit;
