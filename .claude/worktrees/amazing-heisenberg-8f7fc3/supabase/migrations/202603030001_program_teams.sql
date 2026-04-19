begin;

create table if not exists public.program_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  program_node_id uuid not null references public.program_nodes(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  team_code text,
  level_label text,
  age_group text,
  gender text,
  color_primary text,
  color_secondary text,
  home_facility_id uuid references public.facility_spaces(id) on delete set null,
  notes text,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_node_id)
);

create table if not exists public.program_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.program_teams(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  registration_id uuid references public.program_registrations(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'pending', 'waitlisted', 'removed')),
  role text not null default 'player' check (role in ('player', 'alternate', 'guest')),
  jersey_number text,
  position text,
  notes text,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_team_staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.program_teams(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'assistant_coach' check (role in ('head_coach', 'assistant_coach', 'manager', 'trainer', 'volunteer')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists program_teams_program_idx on public.program_teams (program_id, created_at);
create index if not exists program_teams_org_idx on public.program_teams (org_id, created_at);
create index if not exists program_team_members_team_idx on public.program_team_members (team_id, created_at);
create index if not exists program_team_members_program_player_idx on public.program_team_members (program_id, player_id, created_at);
create index if not exists program_team_staff_team_idx on public.program_team_staff (team_id, created_at);

create unique index if not exists program_team_members_active_unique_idx
  on public.program_team_members (program_id, player_id)
  where status in ('active', 'pending', 'waitlisted');

create unique index if not exists program_team_staff_unique_idx
  on public.program_team_staff (team_id, user_id);

-- updated_at triggers

drop trigger if exists program_teams_set_updated_at on public.program_teams;
create trigger program_teams_set_updated_at before update on public.program_teams for each row execute procedure public.set_updated_at();

drop trigger if exists program_team_members_set_updated_at on public.program_team_members;
create trigger program_team_members_set_updated_at before update on public.program_team_members for each row execute procedure public.set_updated_at();

drop trigger if exists program_team_staff_set_updated_at on public.program_team_staff;
create trigger program_team_staff_set_updated_at before update on public.program_team_staff for each row execute procedure public.set_updated_at();

-- Prevent demoting team nodes with roster/staff
create or replace function public.prevent_team_node_demotion()
returns trigger
language plpgsql
as $$
declare
  resolved_team_id uuid;
  has_members boolean;
  has_staff boolean;
begin
  if old.node_kind = 'team' and new.node_kind <> 'team' then
    select id
    into resolved_team_id
    from public.program_teams team
    where team.program_node_id = old.id
    limit 1;

    if resolved_team_id is not null then
      select exists (
        select 1
        from public.program_team_members member
        where member.team_id = resolved_team_id
          and member.status <> 'removed'
      ) into has_members;

      select exists (
        select 1
        from public.program_team_staff staff
        where staff.team_id = resolved_team_id
      ) into has_staff;

      if has_members or has_staff then
        raise exception 'TEAM_HAS_ASSOCIATIONS';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists program_nodes_team_guard on public.program_nodes;
create trigger program_nodes_team_guard
  before update on public.program_nodes
  for each row
  execute procedure public.prevent_team_node_demotion();

-- Sync program_teams rows with program_nodes
create or replace function public.sync_program_team_for_node()
returns trigger
language plpgsql
as $$
begin
  if new.node_kind = 'team' then
    insert into public.program_teams (org_id, program_id, program_node_id)
    select program.org_id, program.id, new.id
    from public.programs program
    where program.id = new.program_id
    on conflict (program_node_id) do nothing;
  elsif tg_op = 'UPDATE' and old.node_kind = 'team' and new.node_kind <> 'team' then
    delete from public.program_teams where program_node_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists program_nodes_team_sync on public.program_nodes;
create trigger program_nodes_team_sync
  after insert or update on public.program_nodes
  for each row
  execute procedure public.sync_program_team_for_node();

-- Backfill existing team nodes
insert into public.program_teams (org_id, program_id, program_node_id)
select program.org_id, program.id, node.id
from public.program_nodes node
join public.programs program on program.id = node.program_id
where node.node_kind = 'team'
on conflict (program_node_id) do nothing;

alter table public.program_teams enable row level security;
alter table public.program_team_members enable row level security;
alter table public.program_team_staff enable row level security;

drop policy if exists program_teams_read on public.program_teams;
create policy program_teams_read on public.program_teams
  for select
  using (
    public.has_org_permission(org_id, 'programs.read')
    or public.has_org_permission(org_id, 'programs.write')
  );

drop policy if exists program_teams_write on public.program_teams;
create policy program_teams_write on public.program_teams
  for all
  using (public.has_org_permission(org_id, 'programs.write'))
  with check (public.has_org_permission(org_id, 'programs.write'));

drop policy if exists program_team_members_read on public.program_team_members;
create policy program_team_members_read on public.program_team_members
  for select
  using (
    public.has_org_permission(org_id, 'programs.read')
    or public.has_org_permission(org_id, 'programs.write')
  );

drop policy if exists program_team_members_write on public.program_team_members;
create policy program_team_members_write on public.program_team_members
  for all
  using (public.has_org_permission(org_id, 'programs.write'))
  with check (public.has_org_permission(org_id, 'programs.write'));

drop policy if exists program_team_staff_read on public.program_team_staff;
create policy program_team_staff_read on public.program_team_staff
  for select
  using (
    public.has_org_permission(org_id, 'programs.read')
    or public.has_org_permission(org_id, 'programs.write')
  );

drop policy if exists program_team_staff_write on public.program_team_staff;
create policy program_team_staff_write on public.program_team_staff
  for all
  using (public.has_org_permission(org_id, 'programs.write'))
  with check (public.has_org_permission(org_id, 'programs.write'));

commit;
