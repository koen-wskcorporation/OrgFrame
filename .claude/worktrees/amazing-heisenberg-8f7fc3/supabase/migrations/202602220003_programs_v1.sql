begin;

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  program_type text not null default 'season' check (program_type in ('league', 'season', 'clinic', 'custom')),
  custom_type_label text,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  start_date date,
  end_date date,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint programs_custom_type_label_required check (
    (program_type = 'custom' and custom_type_label is not null and char_length(trim(custom_type_label)) > 0)
    or (program_type <> 'custom' and custom_type_label is null)
  ),
  constraint programs_date_window_valid check (
    start_date is null
    or end_date is null
    or start_date <= end_date
  )
);

create table if not exists public.program_nodes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  parent_id uuid,
  name text not null,
  slug text not null,
  node_kind text not null default 'division' check (node_kind in ('division', 'subdivision')),
  sort_index integer not null default 0,
  capacity integer,
  waitlist_enabled boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, slug),
  unique (id, program_id),
  constraint program_nodes_parent_fk
    foreign key (parent_id, program_id)
    references public.program_nodes(id, program_id)
    on delete cascade,
  constraint program_nodes_parent_not_self check (parent_id is null or parent_id <> id),
  constraint program_nodes_root_division check (
    (parent_id is null and node_kind = 'division')
    or (parent_id is not null and node_kind = 'subdivision')
  ),
  constraint program_nodes_capacity_nonnegative check (capacity is null or capacity >= 0)
);

create table if not exists public.program_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  program_node_id uuid references public.program_nodes(id) on delete cascade,
  block_type text not null check (block_type in ('date_range', 'meeting_pattern', 'one_off')),
  title text,
  timezone text,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  by_day integer[],
  one_off_at timestamptz,
  sort_index integer not null default 0,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_schedule_blocks_type_shape check (
    (
      block_type = 'date_range'
      and start_date is not null
      and end_date is not null
      and start_date <= end_date
      and one_off_at is null
      and by_day is null
    )
    or (
      block_type = 'meeting_pattern'
      and start_date is not null
      and end_date is not null
      and start_date <= end_date
      and by_day is not null
      and coalesce(array_length(by_day, 1), 0) > 0
      and one_off_at is null
    )
    or (
      block_type = 'one_off'
      and one_off_at is not null
      and start_date is null
      and end_date is null
      and by_day is null
    )
  )
);

create index if not exists programs_org_status_updated_idx on public.programs (org_id, status, updated_at desc);
create index if not exists programs_org_type_idx on public.programs (org_id, program_type);
create index if not exists program_nodes_program_parent_sort_idx on public.program_nodes (program_id, parent_id, sort_index, created_at);
create index if not exists program_schedule_program_sort_idx on public.program_schedule_blocks (program_id, sort_index, created_at);
create index if not exists program_schedule_node_sort_idx on public.program_schedule_blocks (program_node_id, sort_index) where program_node_id is not null;

drop trigger if exists programs_set_updated_at on public.programs;
create trigger programs_set_updated_at before update on public.programs for each row execute procedure public.set_updated_at();

drop trigger if exists program_nodes_set_updated_at on public.program_nodes;
create trigger program_nodes_set_updated_at before update on public.program_nodes for each row execute procedure public.set_updated_at();

drop trigger if exists program_schedule_blocks_set_updated_at on public.program_schedule_blocks;
create trigger program_schedule_blocks_set_updated_at before update on public.program_schedule_blocks for each row execute procedure public.set_updated_at();

alter table public.programs enable row level security;
alter table public.program_nodes enable row level security;
alter table public.program_schedule_blocks enable row level security;

drop policy if exists programs_public_or_read on public.programs;
create policy programs_public_or_read on public.programs
  for select
  using (
    status = 'published'
    or public.has_org_permission(org_id, 'programs.read')
  );

drop policy if exists programs_write on public.programs;
create policy programs_write on public.programs
  for all
  using (public.has_org_permission(org_id, 'programs.write'))
  with check (public.has_org_permission(org_id, 'programs.write'));

drop policy if exists program_nodes_public_or_read on public.program_nodes;
create policy program_nodes_public_or_read on public.program_nodes
  for select
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_nodes.program_id
        and (
          program.status = 'published'
          or public.has_org_permission(program.org_id, 'programs.read')
        )
    )
  );

drop policy if exists program_nodes_write on public.program_nodes;
create policy program_nodes_write on public.program_nodes
  for all
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_nodes.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  )
  with check (
    exists (
      select 1
      from public.programs program
      where program.id = program_nodes.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  );

drop policy if exists program_schedule_public_or_read on public.program_schedule_blocks;
create policy program_schedule_public_or_read on public.program_schedule_blocks
  for select
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_blocks.program_id
        and (
          program.status = 'published'
          or public.has_org_permission(program.org_id, 'programs.read')
        )
    )
  );

drop policy if exists program_schedule_write on public.program_schedule_blocks;
create policy program_schedule_write on public.program_schedule_blocks
  for all
  using (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_blocks.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  )
  with check (
    exists (
      select 1
      from public.programs program
      where program.id = program_schedule_blocks.program_id
        and public.has_org_permission(program.org_id, 'programs.write')
    )
  );

commit;
