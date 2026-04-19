-- ============================================================================
-- OrgFrame V2 normalization migration
-- PostgreSQL / Supabase
-- Coordinated deploy required
-- ============================================================================

begin;

-- ============================================================================
-- 0) Safety: lock the most important tables for a short, explicit cutover
-- ============================================================================

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'program_nodes',
    'org_pages',
    'org_page_blocks',
    'org_site_pages',
    'org_nav_items',
    'org_site_structure_nodes',
    'org_events',
    'calendar_entries',
    'calendar_rules',
    'calendar_occurrences',
    'calendar_sources',
    'calendar_rule_exceptions',
    'calendar_rule_facility_allocations',
    'calendar_occurrence_facility_allocations',
    'calendar_occurrence_teams',
    'facility_nodes'
  ]
  loop
    if to_regclass(format('public.%s', table_name)) is not null then
      execute format('lock table public.%I in access exclusive mode', table_name);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 1) Fix the broken program_nodes model by renaming to program_structure_nodes
--    and rebuilding constraints cleanly.
-- ============================================================================

alter table if exists public.program_nodes
  rename to program_structure_nodes;

-- Drop any broken or duplicated constraints if they survived export/import weirdness.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname like 'program_nodes_parent_fk%'
  loop
    execute format('alter table public.program_structure_nodes drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Keep existing keys in-place and rename constraints when old names are present.
-- Dropping the old PK directly can fail because many external FKs still depend on it.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname = 'program_nodes_pkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname = 'program_structure_nodes_pkey'
  ) then
    execute 'alter table public.program_structure_nodes rename constraint program_nodes_pkey to program_structure_nodes_pkey';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname = 'program_nodes_program_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname = 'program_structure_nodes_program_id_fkey'
  ) then
    execute 'alter table public.program_structure_nodes rename constraint program_nodes_program_id_fkey to program_structure_nodes_program_id_fkey';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname = 'program_nodes_parent_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_structure_nodes'::regclass
      and conname = 'program_structure_nodes_parent_id_fkey'
  ) then
    execute 'alter table public.program_structure_nodes rename constraint program_nodes_parent_id_fkey to program_structure_nodes_parent_id_fkey';
  end if;
end $$;

-- Helpful uniqueness / integrity assumptions
create unique index if not exists program_structure_nodes_program_slug_uidx
  on public.program_structure_nodes(program_id, slug);

create unique index if not exists program_structure_nodes_program_parent_name_uidx
  on public.program_structure_nodes(program_id, parent_id, name);

-- Update foreign keys that reference program_nodes.
alter table if exists public.org_form_submission_entries
  drop constraint if exists org_form_submission_entries_program_node_id_fkey,
  add constraint org_form_submission_entries_program_structure_node_id_fkey
    foreign key (program_node_id) references public.program_structure_nodes(id);

alter table if exists public.org_forms
  drop constraint if exists org_forms_locked_program_node_id_fkey,
  add constraint org_forms_locked_program_structure_node_id_fkey
    foreign key (locked_program_node_id) references public.program_structure_nodes(id);

alter table if exists public.program_registrations
  drop constraint if exists program_registrations_program_node_id_fkey,
  add constraint program_registrations_program_structure_node_id_fkey
    foreign key (program_node_id) references public.program_structure_nodes(id);

alter table if exists public.program_schedule_blocks
  drop constraint if exists program_schedule_blocks_program_node_id_fkey,
  add constraint program_schedule_blocks_program_structure_node_id_fkey
    foreign key (program_node_id) references public.program_structure_nodes(id);

alter table if exists public.program_teams
  drop constraint if exists program_teams_program_node_id_fkey,
  add constraint program_teams_program_structure_node_id_fkey
    foreign key (program_node_id) references public.program_structure_nodes(id);

alter table if exists public.org_order_items
  drop constraint if exists org_order_items_division_node_id_fkey,
  drop constraint if exists org_order_items_team_node_id_fkey,
  add constraint org_order_items_division_structure_node_id_fkey
    foreign key (division_node_id) references public.program_structure_nodes(id),
  add constraint org_order_items_team_structure_node_id_fkey
    foreign key (team_node_id) references public.program_structure_nodes(id);

alter table if exists public.sportsconnect_import_applied_rows
  drop constraint if exists sportsconnect_import_applied_rows_division_node_id_fkey,
  drop constraint if exists sportsconnect_import_applied_rows_team_node_id_fkey,
  add constraint sportsconnect_import_applied_rows_division_structure_node_id_fkey
    foreign key (division_node_id) references public.program_structure_nodes(id),
  add constraint sportsconnect_import_applied_rows_team_structure_node_id_fkey
    foreign key (team_node_id) references public.program_structure_nodes(id);

-- Optional compatibility view so old read queries don't immediately explode.
do $$
begin
  if to_regclass('public.program_structure_nodes') is not null then
    execute 'create or replace view public.program_nodes as select * from public.program_structure_nodes';
  end if;
end $$;

-- ============================================================================
-- 2) Make facilities terminology explicit:
--    facility_nodes were visually-oriented; rename to facility_layout_nodes.
-- ============================================================================

alter table if exists public.facility_nodes
  rename to facility_layout_nodes;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_nodes_pkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_layout_nodes_pkey'
  ) then
    execute 'alter table public.facility_layout_nodes rename constraint facility_nodes_pkey to facility_layout_nodes_pkey';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_nodes_org_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_layout_nodes_org_id_fkey'
  ) then
    execute 'alter table public.facility_layout_nodes rename constraint facility_nodes_org_id_fkey to facility_layout_nodes_org_id_fkey';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_nodes_facility_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_layout_nodes_facility_id_fkey'
  ) then
    execute 'alter table public.facility_layout_nodes rename constraint facility_nodes_facility_id_fkey to facility_layout_nodes_facility_id_fkey';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_nodes_parent_node_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.facility_layout_nodes'::regclass
      and conname = 'facility_layout_nodes_parent_node_id_fkey'
  ) then
    execute 'alter table public.facility_layout_nodes rename constraint facility_nodes_parent_node_id_fkey to facility_layout_nodes_parent_node_id_fkey';
  end if;
end $$;

do $$
begin
  if to_regclass('public.facility_layout_nodes') is not null then
    execute 'create or replace view public.facility_nodes as select * from public.facility_layout_nodes';
  end if;
end $$;

-- ============================================================================
-- 3) Canonical site/page model
--    Keep one real page table, one blocks table, one structure table.
-- ============================================================================

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null,
  title text not null,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  page_type text not null default 'static'
    check (page_type in ('static', 'system', 'dynamic_shell')),
  page_lifecycle text not null default 'permanent'
    check (page_lifecycle in ('permanent', 'temporary')),
  temporary_window_start_utc timestamptz,
  temporary_window_end_utc timestamptz,
  published_at timestamptz,
  legacy_page_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table if not exists public.site_page_blocks (
  id uuid primary key default gen_random_uuid(),
  site_page_id uuid not null references public.site_pages(id) on delete cascade,
  type text not null,
  sort_index integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_structure_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent_id uuid references public.site_structure_nodes(id) on delete cascade,
  sort_index integer not null default 0,
  label text not null,
  node_type text not null
    check (node_type in ('static_page', 'static_link', 'dynamic_page', 'dynamic_link', 'system_generated')),
  site_page_id uuid references public.site_pages(id) on delete set null,
  external_url text,
  page_lifecycle text not null default 'permanent'
    check (page_lifecycle in ('permanent', 'temporary')),
  source_type text not null default 'none'
    check (source_type in ('none', 'programs_tree', 'published_forms', 'published_events')),
  source_scope jsonb not null default '{}'::jsonb,
  generation_rules jsonb not null default '{}'::jsonb,
  child_behavior text not null default 'manual'
    check (child_behavior in ('manual', 'generated_locked', 'generated_with_manual_overrides')),
  route_behavior jsonb not null default '{}'::jsonb,
  label_behavior text not null default 'manual'
    check (label_behavior in ('manual', 'source_name')),
  temporary_window_start_utc timestamptz,
  temporary_window_end_utc timestamptz,
  is_clickable boolean not null default true,
  is_visible boolean not null default true,
  is_system_node boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists site_pages_org_slug_uidx
  on public.site_pages(org_id, slug);

create index if not exists site_structure_nodes_org_parent_sort_idx
  on public.site_structure_nodes(org_id, parent_id, sort_index);

-- Backfill site_pages from org_pages first.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_pages'), to_regclass('public.legacy_org_pages'));
  if source_rel is not null then
    execute format($sql$
      insert into public.site_pages (
        id, org_id, slug, title, status, page_type, page_lifecycle,
        temporary_window_start_utc, temporary_window_end_utc,
        published_at, created_at, updated_at
      )
      select
        p.id,
        p.org_id,
        p.slug,
        p.title,
        case when p.is_published then 'published' else 'draft' end,
        'static',
        p.page_lifecycle,
        p.temporary_window_start_utc,
        p.temporary_window_end_utc,
        case when p.is_published then p.updated_at else null end,
        p.created_at,
        p.updated_at
      from %s p
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill site_pages from org_site_pages when page_key is present but no canonical page exists.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_site_pages'), to_regclass('public.legacy_org_site_pages'));
  if source_rel is not null then
    execute format($sql$
      insert into public.site_pages (
        org_id, slug, title, status, page_type, legacy_page_key, published_at, created_at, updated_at
      )
      select
        sp.org_id,
        lower(regexp_replace(sp.page_key, '[^a-zA-Z0-9]+', '-', 'g')),
        initcap(replace(sp.page_key, '_', ' ')),
        'published',
        'system',
        sp.page_key,
        sp.published_at,
        sp.created_at,
        sp.updated_at
      from %s sp
      where not exists (
        select 1
        from public.site_pages p
        where p.org_id = sp.org_id
          and (p.legacy_page_key = sp.page_key or p.slug = lower(regexp_replace(sp.page_key, '[^a-zA-Z0-9]+', '-', 'g')))
      )
    $sql$, source_rel);
  end if;
end $$;

-- Backfill blocks from org_page_blocks.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_page_blocks'), to_regclass('public.legacy_org_page_blocks'));
  if source_rel is not null then
    execute format($sql$
      insert into public.site_page_blocks (
        id, site_page_id, type, sort_index, config, created_at, updated_at
      )
      select
        b.id,
        b.org_page_id,
        b.type,
        b.sort_index,
        b.config,
        b.created_at,
        b.updated_at
      from %s b
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill structure from org_site_structure_nodes.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_site_structure_nodes'), to_regclass('public.legacy_org_site_structure_nodes'));
  if source_rel is not null then
    execute format($sql$
      insert into public.site_structure_nodes (
        id, org_id, parent_id, sort_index, label, node_type, site_page_id, external_url,
        page_lifecycle, source_type, source_scope, generation_rules, child_behavior,
        route_behavior, label_behavior, temporary_window_start_utc, temporary_window_end_utc,
        is_clickable, is_visible, is_system_node, created_at, updated_at
      )
      select
        n.id,
        n.org_id,
        n.parent_id,
        n.sort_index,
        n.label,
        n.node_kind,
        p.id,
        n.external_url,
        n.page_lifecycle,
        n.source_type,
        n.source_scope_json,
        n.generation_rules_json,
        n.child_behavior,
        n.route_behavior_json,
        n.label_behavior,
        n.temporary_window_start_utc,
        n.temporary_window_end_utc,
        n.is_clickable,
        n.is_visible,
        n.is_system_node,
        n.created_at,
        n.updated_at
      from %s n
      left join public.site_pages p
        on p.org_id = n.org_id
       and p.slug = n.page_slug
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Fold legacy nav items into canonical site_structure_nodes if they don't already exist.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_nav_items'), to_regclass('public.legacy_org_nav_items'));
  if source_rel is not null then
    execute format($sql$
      insert into public.site_structure_nodes (
        org_id, parent_id, sort_index, label, node_type, site_page_id, external_url,
        is_clickable, is_visible, created_at, updated_at
      )
      select
        ni.org_id,
        ni.parent_id,
        ni.sort_index,
        ni.label,
        case
          when ni.link_type = 'external' then 'static_link'
          when ni.link_type = 'internal' then 'static_page'
          else 'static_link'
        end,
        p.id,
        ni.external_url,
        true,
        ni.is_visible,
        ni.created_at,
        ni.updated_at
      from %s ni
      left join public.site_pages p
        on p.org_id = ni.org_id
       and p.slug = ni.page_slug
      where not exists (
        select 1
        from public.site_structure_nodes sn
        where sn.org_id = ni.org_id
          and sn.label = ni.label
          and coalesce(sn.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce(ni.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
    $sql$, source_rel);
  end if;
end $$;

-- Preserve old tables as legacy_*.
alter table if exists public.org_pages rename to legacy_org_pages;
alter table if exists public.org_page_blocks rename to legacy_org_page_blocks;
alter table if exists public.org_site_pages rename to legacy_org_site_pages;
alter table if exists public.org_nav_items rename to legacy_org_nav_items;
alter table if exists public.org_site_structure_nodes rename to legacy_org_site_structure_nodes;

-- Compatibility views for reads.
create or replace view public.org_pages as
select
  id,
  org_id,
  slug,
  title,
  (status = 'published') as is_published,
  created_at,
  updated_at,
  0 as sort_index,
  page_lifecycle,
  temporary_window_start_utc,
  temporary_window_end_utc
from public.site_pages;

create or replace view public.org_page_blocks as
select
  id,
  site_page_id as org_page_id,
  type,
  sort_index,
  config,
  created_at,
  updated_at
from public.site_page_blocks;

create or replace view public.org_site_structure_nodes as
select
  sn.id,
  sn.org_id,
  sn.parent_id,
  sn.sort_index,
  sn.label,
  sn.node_type as node_kind,
  sp.slug as page_slug,
  sn.external_url,
  sn.page_lifecycle,
  sn.source_type,
  sn.source_scope as source_scope_json,
  sn.generation_rules as generation_rules_json,
  sn.child_behavior,
  sn.route_behavior as route_behavior_json,
  sn.label_behavior,
  sn.temporary_window_start_utc,
  sn.temporary_window_end_utc,
  sn.is_clickable,
  sn.is_visible,
  sn.is_system_node,
  sn.created_at,
  sn.updated_at
from public.site_structure_nodes sn
left join public.site_pages sp on sp.id = sn.site_page_id;

create or replace view public.org_nav_items as
select
  sn.id,
  sn.org_id,
  sn.parent_id,
  sn.label,
  case
    when sn.external_url is not null then 'external'
    when sn.site_page_id is not null then 'internal'
    else 'none'
  end as link_type,
  sp.slug as page_slug,
  sn.external_url,
  false as open_in_new_tab,
  sn.sort_index,
  sn.created_at,
  sn.updated_at,
  sn.is_visible
from public.site_structure_nodes sn
left join public.site_pages sp on sp.id = sn.site_page_id
where sn.node_type in ('static_page', 'static_link');

-- ============================================================================
-- 4) Canonical calendar model
--    calendar_entries becomes calendar_items, and org_events is folded in.
-- ============================================================================

create table if not exists public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_id uuid,
  item_type text not null
    check (item_type in ('event', 'practice', 'game', 'meeting', 'fundraiser', 'facility', 'deadline', 'custom')),
  title text not null,
  summary text,
  visibility text not null default 'internal'
    check (visibility in ('internal', 'published')),
  status text not null default 'scheduled'
    check (status in ('draft', 'scheduled', 'cancelled', 'archived')),
  timezone text not null default 'UTC',
  purpose text not null default 'custom_other',
  audience text not null default 'private_internal',
  host_team_id uuid references public.program_teams(id) on delete set null,
  location text,
  settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_item_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  scope_type text not null
    check (scope_type in ('organization', 'program', 'division', 'team', 'custom')),
  scope_id uuid,
  scope_label text,
  parent_source_id uuid references public.calendar_item_sources(id) on delete cascade,
  purpose_defaults text[] not null default '{}'::text[],
  audience_defaults text[] not null default '{}'::text[],
  is_custom_calendar boolean not null default false,
  is_active boolean not null default true,
  display jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_item_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  mode text not null
    check (mode in ('single_date', 'multiple_specific_dates', 'repeating_pattern', 'continuous_date_range', 'custom_advanced')),
  timezone text not null,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  interval_count integer not null default 1 check (interval_count > 0),
  interval_unit text
    check (interval_unit in ('day', 'week', 'month')),
  by_weekday text[],
  by_monthday integer[],
  end_mode text not null default 'until_date'
    check (end_mode in ('never', 'until_date', 'after_occurrences')),
  until_date date,
  max_occurrences integer check (max_occurrences is null or max_occurrences > 0),
  sort_index integer not null default 0,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  rule_hash text not null default '',
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_item_occurrences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  source_rule_id uuid references public.calendar_item_rules(id) on delete set null,
  source_type text not null
    check (source_type in ('single', 'rule', 'override')),
  source_key text not null,
  timezone text not null,
  local_date date not null,
  local_start_time time,
  local_end_time time,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_item_rule_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid not null references public.calendar_item_rules(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('skip', 'override')),
  override_occurrence_id uuid references public.calendar_item_occurrences(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_item_space_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid references public.calendar_item_rules(id) on delete cascade,
  occurrence_id uuid references public.calendar_item_occurrences(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  configuration_id uuid references public.facility_space_configurations(id) on delete set null,
  lock_mode text not null default 'exclusive'
    check (lock_mode in ('exclusive', 'shared_invite_only')),
  allow_shared boolean not null default false,
  starts_at_utc timestamptz,
  ends_at_utc timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (rule_id is not null and occurrence_id is null)
    or
    (rule_id is null and occurrence_id is not null)
  )
);

create table if not exists public.calendar_item_participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  occurrence_id uuid not null references public.calendar_item_occurrences(id) on delete cascade,
  team_id uuid not null references public.program_teams(id) on delete cascade,
  role text not null check (role in ('host', 'participant')),
  invite_status text not null default 'accepted'
    check (invite_status in ('accepted', 'pending', 'declined', 'left')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  responded_by_user_id uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill sources first.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.calendar_sources'), to_regclass('public.legacy_calendar_sources'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_sources (
        id, org_id, name, scope_type, scope_id, scope_label, parent_source_id,
        purpose_defaults, audience_defaults, is_custom_calendar, is_active, display,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        id, org_id, name, scope_type, scope_id, scope_label, parent_source_id,
        purpose_defaults, audience_defaults, is_custom_calendar, is_active, display_json,
        created_by, updated_by, created_at, updated_at
      from %s
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill calendar_entries into canonical items.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.calendar_entries'), to_regclass('public.legacy_calendar_entries'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_items (
        id, org_id, source_id, item_type, title, summary, visibility, status, timezone,
        purpose, audience, host_team_id, settings, metadata,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        e.id,
        e.org_id,
        e.source_id,
        case
          when e.entry_type in ('event', 'practice', 'game') then e.entry_type
          else 'custom'
        end,
        e.title,
        e.summary,
        e.visibility,
        e.status,
        coalesce(e.default_timezone, 'UTC'),
        coalesce(e.purpose, 'custom_other'),
        coalesce(e.audience, 'private_internal'),
        e.host_team_id,
        e.settings_json,
        '{}'::jsonb || e.settings_json,
        e.created_by,
        e.updated_by,
        e.created_at,
        e.updated_at
      from %s e
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Fold org_events into canonical items too.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_events'), to_regclass('public.legacy_org_events'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_items (
        id, org_id, item_type, title, summary, visibility, status, timezone, location,
        purpose, audience, settings, metadata, created_by_user_id, created_at, updated_at
      )
      select
        oe.id,
        oe.org_id,
        'event',
        oe.title,
        oe.summary,
        case when oe.status = 'published' then 'published' else 'internal' end,
        case
          when oe.status = 'archived' then 'archived'
          when oe.status = 'draft' then 'draft'
          else 'scheduled'
        end,
        oe.timezone,
        oe.location,
        'custom_other',
        'private_internal',
        oe.settings_json,
        jsonb_build_object(
          'legacy_org_event', true,
          'is_all_day', oe.is_all_day,
          'all_day_start_date', oe.all_day_start_date,
          'all_day_end_date', oe.all_day_end_date
        ),
        oe.created_by,
        oe.created_at,
        oe.updated_at
      from %s oe
      where not exists (
        select 1 from public.calendar_items ci where ci.id = oe.id
      )
    $sql$, source_rel);
  end if;
end $$;

-- Create single-occurrence rows for org_events that were not already in calendar_entries.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.org_events'), to_regclass('public.legacy_org_events'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_occurrences (
        org_id, item_id, source_type, source_key, timezone, local_date,
        local_start_time, local_end_time, starts_at_utc, ends_at_utc, status, metadata,
        created_by_user_id, created_at, updated_at
      )
      select
        oe.org_id,
        oe.id,
        'single',
        'legacy-org-event:' || oe.id::text,
        oe.timezone,
        (oe.starts_at_utc at time zone oe.timezone)::date,
        (oe.starts_at_utc at time zone oe.timezone)::time,
        (oe.ends_at_utc at time zone oe.timezone)::time,
        oe.starts_at_utc,
        oe.ends_at_utc,
        case when oe.status = 'archived' then 'cancelled' else 'scheduled' end,
        '{}'::jsonb,
        oe.created_by,
        oe.created_at,
        oe.updated_at
      from %s oe
      where not exists (
        select 1
        from public.calendar_item_occurrences o
        where o.item_id = oe.id
      )
    $sql$, source_rel);
  end if;
end $$;

-- Backfill rules.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.calendar_rules'), to_regclass('public.legacy_calendar_rules'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_rules (
        id, org_id, item_id, mode, timezone, start_date, end_date, start_time, end_time,
        interval_count, interval_unit, by_weekday, by_monthday, end_mode, until_date,
        max_occurrences, sort_index, is_active, config, rule_hash,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        r.id, r.org_id, r.entry_id, r.mode, r.timezone, r.start_date, r.end_date, r.start_time, r.end_time,
        r.interval_count, r.interval_unit, r.by_weekday::text[], r.by_monthday::integer[], r.end_mode,
        r.until_date, r.max_occurrences, r.sort_index, r.is_active, r.config_json, r.rule_hash,
        r.created_by, r.updated_by, r.created_at, r.updated_at
      from %s r
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill occurrences.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.calendar_occurrences'), to_regclass('public.legacy_calendar_occurrences'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_occurrences (
        id, org_id, item_id, source_rule_id, source_type, source_key, timezone, local_date,
        local_start_time, local_end_time, starts_at_utc, ends_at_utc, status, metadata,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        o.id, o.org_id, o.entry_id, o.source_rule_id, o.source_type, o.source_key, o.timezone, o.local_date,
        o.local_start_time, o.local_end_time, o.starts_at_utc, o.ends_at_utc, o.status, o.metadata_json,
        o.created_by, o.updated_by, o.created_at, o.updated_at
      from %s o
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill rule exceptions.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.calendar_rule_exceptions'), to_regclass('public.legacy_calendar_rule_exceptions'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_rule_exceptions (
        id, org_id, rule_id, source_key, kind, override_occurrence_id, payload,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        e.id, e.org_id, e.rule_id, e.source_key, e.kind, e.override_occurrence_id, e.payload_json,
        e.created_by, e.updated_by, e.created_at, e.updated_at
      from %s e
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill rule-level space allocations.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(
    to_regclass('public.calendar_rule_facility_allocations'),
    to_regclass('public.legacy_calendar_rule_facility_allocations')
  );
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_space_allocations (
        id, org_id, rule_id, space_id, configuration_id, lock_mode, allow_shared, is_active,
        metadata, created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        a.id, a.org_id, a.rule_id, a.space_id, a.configuration_id, a.lock_mode, a.allow_shared, a.is_active,
        a.metadata_json, a.created_by, a.updated_by, a.created_at, a.updated_at
      from %s a
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Backfill occurrence-level space allocations.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(
    to_regclass('public.calendar_occurrence_facility_allocations'),
    to_regclass('public.legacy_calendar_occurrence_facility_allocations')
  );
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_space_allocations (
        id, org_id, occurrence_id, space_id, configuration_id, lock_mode, allow_shared,
        starts_at_utc, ends_at_utc, is_active, metadata,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      )
      select
        a.id, a.org_id, a.occurrence_id, a.space_id, a.configuration_id, a.lock_mode, a.allow_shared,
        a.starts_at_utc, a.ends_at_utc, a.is_active, a.metadata_json,
        a.created_by, a.updated_by, a.created_at, a.updated_at
      from %s a
      where not exists (
        select 1 from public.calendar_item_space_allocations x where x.id = a.id
      )
    $sql$, source_rel);
  end if;
end $$;

-- Backfill participants.
do $$
declare
  source_rel regclass;
begin
  source_rel := coalesce(to_regclass('public.calendar_occurrence_teams'), to_regclass('public.legacy_calendar_occurrence_teams'));
  if source_rel is not null then
    execute format($sql$
      insert into public.calendar_item_participants (
        id, org_id, occurrence_id, team_id, role, invite_status,
        invited_by_user_id, invited_at, responded_by_user_id, responded_at, created_at, updated_at
      )
      select
        t.id, t.org_id, t.occurrence_id, t.team_id, t.role, t.invite_status,
        t.invited_by_user_id, t.invited_at, t.responded_by_user_id, t.responded_at, t.created_at, t.updated_at
      from %s t
      on conflict (id) do nothing
    $sql$, source_rel);
  end if;
end $$;

-- Preserve legacy tables.
alter table if exists public.calendar_entries rename to legacy_calendar_entries;
alter table if exists public.calendar_rules rename to legacy_calendar_rules;
alter table if exists public.calendar_occurrences rename to legacy_calendar_occurrences;
alter table if exists public.calendar_rule_exceptions rename to legacy_calendar_rule_exceptions;
alter table if exists public.calendar_rule_facility_allocations rename to legacy_calendar_rule_facility_allocations;
alter table if exists public.calendar_occurrence_facility_allocations rename to legacy_calendar_occurrence_facility_allocations;
alter table if exists public.calendar_occurrence_teams rename to legacy_calendar_occurrence_teams;
alter table if exists public.calendar_sources rename to legacy_calendar_sources;
alter table if exists public.org_events rename to legacy_org_events;

-- Compatibility views.
create or replace view public.calendar_sources as
select
  id, org_id, name, scope_type, scope_id, scope_label, parent_source_id,
  purpose_defaults, audience_defaults, is_custom_calendar, is_active,
  display as display_json,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at, updated_at
from public.calendar_item_sources;

create or replace view public.calendar_entries as
select
  id,
  org_id,
  case
    when item_type in ('event', 'practice', 'game') then item_type
    else 'event'
  end as entry_type,
  title,
  summary,
  visibility,
  case
    when status = 'draft' then 'scheduled'
    else status
  end as status,
  host_team_id,
  timezone as default_timezone,
  settings as settings_json,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at,
  updated_at,
  source_id,
  purpose,
  audience
from public.calendar_items;

create or replace view public.calendar_rules as
select
  id, org_id, item_id as entry_id, mode, timezone, start_date, end_date, start_time, end_time,
  interval_count, interval_unit, by_weekday, by_monthday, end_mode, until_date,
  max_occurrences, sort_index, is_active, config as config_json, rule_hash,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at, updated_at
from public.calendar_item_rules;

create or replace view public.calendar_occurrences as
select
  id, org_id, item_id as entry_id, source_rule_id, source_type, source_key, timezone, local_date,
  local_start_time, local_end_time, starts_at_utc, ends_at_utc, status,
  metadata as metadata_json,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at, updated_at
from public.calendar_item_occurrences;

create or replace view public.calendar_rule_exceptions as
select
  id, org_id, rule_id, source_key, kind, override_occurrence_id,
  payload as payload_json,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at, updated_at
from public.calendar_item_rule_exceptions;

create or replace view public.calendar_rule_facility_allocations as
select
  id, org_id, rule_id, space_id, configuration_id, lock_mode, allow_shared, is_active,
  metadata as metadata_json,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at, updated_at
from public.calendar_item_space_allocations
where rule_id is not null;

create or replace view public.calendar_occurrence_facility_allocations as
select
  id, org_id, occurrence_id, space_id, configuration_id, lock_mode, allow_shared,
  starts_at_utc, ends_at_utc, is_active, metadata as metadata_json,
  created_by_user_id as created_by,
  updated_by_user_id as updated_by,
  created_at, updated_at
from public.calendar_item_space_allocations
where occurrence_id is not null;

create or replace view public.calendar_occurrence_teams as
select
  id, org_id, occurrence_id, team_id, role, invite_status,
  invited_by_user_id, invited_at, responded_by_user_id, responded_at, created_at, updated_at
from public.calendar_item_participants;

create or replace view public.org_events as
select
  ci.id,
  ci.org_id,
  ci.title,
  ci.summary,
  ci.location,
  ci.timezone,
  case
    when ci.status = 'draft' then 'draft'
    when ci.status = 'archived' then 'archived'
    else 'published'
  end as status,
  coalesce((ci.metadata ->> 'is_all_day')::boolean, false) as is_all_day,
  (ci.metadata ->> 'all_day_start_date')::date as all_day_start_date,
  (ci.metadata ->> 'all_day_end_date')::date as all_day_end_date,
  occ.starts_at_utc,
  occ.ends_at_utc,
  ci.settings as settings_json,
  ci.created_by_user_id as created_by,
  ci.created_at,
  ci.updated_at
from public.calendar_items ci
left join lateral (
  select o.starts_at_utc, o.ends_at_utc
  from public.calendar_item_occurrences o
  where o.item_id = ci.id
  order by o.starts_at_utc asc
  limit 1
) occ on true
where ci.item_type = 'event';

-- ============================================================================
-- 5) Naming cleanup where it gives the most value without rewriting the world
-- ============================================================================

alter table if exists public.org_form_submission_entries
  rename to org_form_submission_players;

alter table if exists public.org_user_inbox_items
  rename to user_notifications;

alter table if exists public.calendar_lens_saved_views
  rename to calendar_saved_views;

-- Compatibility views for those renames.
create or replace view public.org_form_submission_entries as
select * from public.org_form_submission_players;

create or replace view public.org_user_inbox_items as
select * from public.user_notifications;

create or replace view public.calendar_lens_saved_views as
select * from public.calendar_saved_views;

-- ============================================================================
-- 6) Consistency indexes
-- ============================================================================

create index if not exists calendar_items_org_type_status_idx
  on public.calendar_items(org_id, item_type, status);

create index if not exists calendar_item_occurrences_org_start_idx
  on public.calendar_item_occurrences(org_id, starts_at_utc);

create index if not exists calendar_item_occurrences_item_start_idx
  on public.calendar_item_occurrences(item_id, starts_at_utc);

create index if not exists calendar_item_rules_item_idx
  on public.calendar_item_rules(item_id);

create index if not exists calendar_item_space_allocations_occurrence_idx
  on public.calendar_item_space_allocations(occurrence_id);

create index if not exists calendar_item_space_allocations_rule_idx
  on public.calendar_item_space_allocations(rule_id);

create index if not exists site_page_blocks_page_sort_idx
  on public.site_page_blocks(site_page_id, sort_index);

-- ============================================================================
-- 7) Mark legacy tables clearly for later removal
-- ============================================================================

do $$
declare
  table_name text;
  comment_text text;
begin
  for table_name, comment_text in
    values
      ('legacy_org_pages', 'LEGACY: replaced by public.site_pages'),
      ('legacy_org_page_blocks', 'LEGACY: replaced by public.site_page_blocks'),
      ('legacy_org_site_pages', 'LEGACY: folded into public.site_pages'),
      ('legacy_org_nav_items', 'LEGACY: folded into public.site_structure_nodes'),
      ('legacy_org_site_structure_nodes', 'LEGACY: replaced by public.site_structure_nodes'),
      ('legacy_calendar_entries', 'LEGACY: replaced by public.calendar_items'),
      ('legacy_calendar_rules', 'LEGACY: replaced by public.calendar_item_rules'),
      ('legacy_calendar_occurrences', 'LEGACY: replaced by public.calendar_item_occurrences'),
      ('legacy_calendar_rule_exceptions', 'LEGACY: replaced by public.calendar_item_rule_exceptions'),
      ('legacy_calendar_rule_facility_allocations', 'LEGACY: replaced by public.calendar_item_space_allocations'),
      ('legacy_calendar_occurrence_facility_allocations', 'LEGACY: replaced by public.calendar_item_space_allocations'),
      ('legacy_calendar_occurrence_teams', 'LEGACY: replaced by public.calendar_item_participants'),
      ('legacy_calendar_sources', 'LEGACY: replaced by public.calendar_item_sources'),
      ('legacy_org_events', 'LEGACY: folded into public.calendar_items')
  loop
    if to_regclass(format('public.%s', table_name)) is not null then
      execute format('comment on table public.%I is %L', table_name, comment_text);
    end if;
  end loop;
end $$;

commit;
