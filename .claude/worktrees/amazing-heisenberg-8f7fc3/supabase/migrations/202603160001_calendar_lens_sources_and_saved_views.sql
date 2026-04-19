begin;

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  scope_type text not null check (scope_type in ('organization', 'program', 'division', 'team', 'custom')),
  scope_id uuid,
  scope_label text,
  parent_source_id uuid references public.calendar_sources(id) on delete set null,
  purpose_defaults text[] not null default '{}'::text[]
    check (
      purpose_defaults <@ array['games', 'practices', 'tryouts', 'season_dates', 'meetings', 'fundraisers', 'facilities', 'deadlines', 'custom_other']::text[]
    ),
  audience_defaults text[] not null default '{}'::text[]
    check (
      audience_defaults <@ array['me', 'public', 'staff', 'coaches', 'board', 'parents', 'players', 'team_members_only', 'private_internal']::text[]
    ),
  is_custom_calendar boolean not null default false,
  is_active boolean not null default true,
  display_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists calendar_sources_org_idx on public.calendar_sources (org_id, scope_type, is_active, created_at);
create unique index if not exists calendar_sources_scope_unique_idx on public.calendar_sources (org_id, scope_type, scope_id, name);

alter table public.calendar_entries
  add column if not exists source_id uuid references public.calendar_sources(id) on delete set null,
  add column if not exists purpose text,
  add column if not exists audience text;

alter table public.calendar_entries
  alter column purpose set default 'custom_other',
  alter column audience set default 'private_internal';

update public.calendar_entries
set purpose = case
  when entry_type = 'game' then 'games'
  when entry_type = 'practice' then 'practices'
  else 'custom_other'
end
where purpose is null;

update public.calendar_entries
set audience = case
  when visibility = 'published' then 'public'
  else 'private_internal'
end
where audience is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_entries_purpose_check'
  ) then
    alter table public.calendar_entries
      add constraint calendar_entries_purpose_check
      check (purpose in ('games', 'practices', 'tryouts', 'season_dates', 'meetings', 'fundraisers', 'facilities', 'deadlines', 'custom_other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_entries_audience_check'
  ) then
    alter table public.calendar_entries
      add constraint calendar_entries_audience_check
      check (audience in ('me', 'public', 'staff', 'coaches', 'board', 'parents', 'players', 'team_members_only', 'private_internal'));
  end if;
end $$;

create index if not exists calendar_entries_source_idx on public.calendar_entries (org_id, source_id, status, created_at desc);
create index if not exists calendar_entries_purpose_audience_idx on public.calendar_entries (org_id, purpose, audience, created_at desc);

insert into public.calendar_sources (
  org_id,
  name,
  scope_type,
  scope_id,
  scope_label,
  purpose_defaults,
  audience_defaults,
  is_custom_calendar,
  is_active,
  display_json
)
select
  org.id,
  'Organization Calendar',
  'organization',
  org.id,
  org.name,
  array['meetings', 'fundraisers', 'season_dates', 'custom_other']::text[],
  array['public', 'private_internal']::text[],
  false,
  true,
  jsonb_build_object('kind', 'default_org')
from public.orgs org
where not exists (
  select 1
  from public.calendar_sources source
  where source.org_id = org.id
    and source.scope_type = 'organization'
    and source.scope_id = org.id
);

insert into public.calendar_sources (
  org_id,
  name,
  scope_type,
  scope_id,
  scope_label,
  purpose_defaults,
  audience_defaults,
  is_custom_calendar,
  is_active,
  display_json
)
select
  team.org_id,
  coalesce(node.name, 'Team Calendar'),
  'team',
  team.id,
  node.name,
  array['games', 'practices', 'meetings']::text[],
  array['team_members_only', 'coaches', 'parents', 'public']::text[],
  false,
  true,
  jsonb_build_object('kind', 'default_team')
from public.program_teams team
left join public.program_nodes node on node.id = team.id
where not exists (
  select 1
  from public.calendar_sources source
  where source.org_id = team.org_id
    and source.scope_type = 'team'
    and source.scope_id = team.id
);

insert into public.calendar_sources (
  org_id,
  name,
  scope_type,
  scope_id,
  scope_label,
  purpose_defaults,
  audience_defaults,
  is_custom_calendar,
  is_active,
  display_json
)
select
  program.org_id,
  coalesce(program.name, 'Program Calendar'),
  'program',
  program.id,
  program.name,
  array['season_dates', 'tryouts', 'meetings', 'custom_other']::text[],
  array['public', 'staff', 'coaches', 'private_internal']::text[],
  false,
  true,
  jsonb_build_object('kind', 'default_program')
from public.programs program
where not exists (
  select 1
  from public.calendar_sources source
  where source.org_id = program.org_id
    and source.scope_type = 'program'
    and source.scope_id = program.id
);

update public.calendar_entries entry
set source_id = source.id
from public.calendar_sources source
where entry.source_id is null
  and entry.host_team_id is not null
  and source.org_id = entry.org_id
  and source.scope_type = 'team'
  and source.scope_id = entry.host_team_id;

update public.calendar_entries entry
set source_id = source.id
from public.calendar_sources source
where entry.source_id is null
  and source.org_id = entry.org_id
  and source.scope_type = 'organization'
  and source.scope_id = entry.org_id;

create table if not exists public.calendar_lens_saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  context_type text check (context_type in ('org', 'program', 'division', 'team', 'facility', 'public', 'embedded')),
  is_default boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists calendar_lens_saved_views_org_user_idx on public.calendar_lens_saved_views (org_id, user_id, updated_at desc);
create unique index if not exists calendar_lens_saved_views_context_default_idx
  on public.calendar_lens_saved_views (org_id, user_id, context_type)
  where is_default = true;

do $$
begin
  if to_regclass('public.program_schedule_rules') is not null then
    create index if not exists program_schedule_rules_program_idx on public.program_schedule_rules (program_id, id);

    with program_source as (
      select source.id as source_id, source.scope_id as program_id, source.org_id
      from public.calendar_sources source
      where source.scope_type = 'program'
    )
    insert into public.calendar_entries (
      org_id,
      source_id,
      purpose,
      audience,
      entry_type,
      title,
      summary,
      visibility,
      status,
      host_team_id,
      default_timezone,
      settings_json,
      created_by,
      updated_by
    )
    select
      ps.org_id,
      ps.source_id,
      'season_dates',
      'private_internal',
      'event',
      coalesce(rule.title, 'Program schedule'),
      null,
      'internal',
      case when rule.is_active then 'scheduled' else 'archived' end,
      null,
      coalesce(rule.timezone, 'UTC'),
      jsonb_build_object(
        'legacyProgramRuleId', rule.id,
        'legacyProgramId', rule.program_id,
        'legacyProgramNodeId', rule.program_node_id
      ),
      null,
      null
    from public.program_schedule_rules rule
    join program_source ps on ps.program_id = rule.program_id
    where not exists (
      select 1
      from public.calendar_entries entry
      where entry.org_id = ps.org_id
        and entry.settings_json ->> 'legacyProgramRuleId' = rule.id::text
    );

    insert into public.calendar_rules (
      org_id,
      entry_id,
      mode,
      timezone,
      start_date,
      end_date,
      start_time,
      end_time,
      interval_count,
      interval_unit,
      by_weekday,
      by_monthday,
      end_mode,
      until_date,
      max_occurrences,
      sort_index,
      is_active,
      config_json,
      rule_hash,
      created_by,
      updated_by
    )
    select
      entry.org_id,
      entry.id,
      rule.mode,
      coalesce(rule.timezone, entry.default_timezone, 'UTC'),
      rule.start_date,
      rule.end_date,
      rule.start_time,
      rule.end_time,
      coalesce(rule.interval_count, 1),
      rule.interval_unit,
      rule.by_weekday,
      rule.by_monthday,
      rule.end_mode,
      rule.until_date,
      rule.max_occurrences,
      coalesce(rule.sort_index, 0),
      coalesce(rule.is_active, true),
      coalesce(rule.config_json, '{}'::jsonb) || jsonb_build_object('legacyProgramRuleId', rule.id),
      coalesce(rule.rule_hash, md5(rule.id::text)),
      null,
      null
    from public.program_schedule_rules rule
    join public.programs program on program.id = rule.program_id
    join public.calendar_entries entry
      on entry.org_id = program.org_id
      and entry.settings_json ->> 'legacyProgramRuleId' = rule.id::text
    where not exists (
      select 1
      from public.calendar_rules calendar_rule
      where calendar_rule.entry_id = entry.id
        and calendar_rule.config_json ->> 'legacyProgramRuleId' = rule.id::text
    );
  end if;

  if to_regclass('public.program_occurrences') is not null then
    create index if not exists program_occurrences_program_idx on public.program_occurrences (program_id, id);

    insert into public.calendar_occurrences (
      org_id,
      entry_id,
      source_rule_id,
      source_type,
      source_key,
      timezone,
      local_date,
      local_start_time,
      local_end_time,
      starts_at_utc,
      ends_at_utc,
      status,
      metadata_json,
      created_by,
      updated_by
    )
    select
      entry.org_id,
      entry.id,
      calendar_rule.id,
      case when occurrence.source_type in ('rule', 'override') then occurrence.source_type else 'single' end,
      concat('legacy-program:', occurrence.id::text),
      coalesce(occurrence.timezone, entry.default_timezone, 'UTC'),
      occurrence.local_date,
      occurrence.local_start_time,
      occurrence.local_end_time,
      occurrence.starts_at_utc,
      occurrence.ends_at_utc,
      case when occurrence.status = 'cancelled' then 'cancelled' else 'scheduled' end,
      coalesce(occurrence.metadata_json, '{}'::jsonb) || jsonb_build_object(
        'legacyProgramOccurrenceId', occurrence.id,
        'legacyProgramRuleId', occurrence.source_rule_id,
        'legacyProgramId', occurrence.program_id,
        'legacyProgramNodeId', occurrence.program_node_id
      ),
      null,
      null
    from public.program_occurrences occurrence
    join public.programs program on program.id = occurrence.program_id
    join public.calendar_entries entry
      on entry.org_id = program.org_id
      and (
        entry.settings_json ->> 'legacyProgramRuleId' = occurrence.source_rule_id::text
        or (
          occurrence.source_rule_id is null
          and entry.settings_json ->> 'legacyProgramId' = occurrence.program_id::text
        )
      )
    left join public.calendar_rules calendar_rule
      on calendar_rule.entry_id = entry.id
      and calendar_rule.config_json ->> 'legacyProgramRuleId' = occurrence.source_rule_id::text
    where not exists (
      select 1
      from public.calendar_occurrences existing
      where existing.org_id = entry.org_id
        and existing.source_key = concat('legacy-program:', occurrence.id::text)
    );
  end if;
end $$;

alter table public.calendar_sources enable row level security;
alter table public.calendar_lens_saved_views enable row level security;

drop trigger if exists calendar_sources_set_updated_at on public.calendar_sources;
create trigger calendar_sources_set_updated_at
  before update on public.calendar_sources
  for each row execute procedure public.set_updated_at();

drop trigger if exists calendar_lens_saved_views_set_updated_at on public.calendar_lens_saved_views;
create trigger calendar_lens_saved_views_set_updated_at
  before update on public.calendar_lens_saved_views
  for each row execute procedure public.set_updated_at();

drop policy if exists calendar_sources_select on public.calendar_sources;
create policy calendar_sources_select on public.calendar_sources
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or exists (
      select 1
      from public.org_memberships membership
      where membership.org_id = calendar_sources.org_id
        and membership.user_id = auth.uid()
    )
  );

drop policy if exists calendar_sources_write on public.calendar_sources;
create policy calendar_sources_write on public.calendar_sources
  for all
  using (public.has_org_permission(org_id, 'calendar.write'))
  with check (public.has_org_permission(org_id, 'calendar.write'));

drop policy if exists calendar_lens_saved_views_select on public.calendar_lens_saved_views;
create policy calendar_lens_saved_views_select on public.calendar_lens_saved_views
  for select
  using (
    user_id = auth.uid()
    and (
      public.has_org_permission(org_id, 'calendar.read')
      or public.has_org_permission(org_id, 'calendar.write')
      or exists (
        select 1
        from public.org_memberships membership
        where membership.org_id = calendar_lens_saved_views.org_id
          and membership.user_id = auth.uid()
      )
    )
  );

drop policy if exists calendar_lens_saved_views_write on public.calendar_lens_saved_views;
create policy calendar_lens_saved_views_write on public.calendar_lens_saved_views
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
