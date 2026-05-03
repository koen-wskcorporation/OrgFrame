begin;

-- Per-org configurable status definitions for facility spaces.
-- Each org gets three system rows (Open / Closed / Archived) seeded automatically.
-- System rows: label and color editable, behaves_as locked, undeletable.
-- Custom rows: free label/color, but each must declare a behaves_as for behavior gating.

create table if not exists facilities.space_statuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  label text not null,
  color text not null default 'slate',
  behaves_as text not null check (behaves_as in ('open', 'closed', 'archived')),
  is_system boolean not null default false,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, label)
);

create index if not exists facility_space_statuses_org_idx
  on facilities.space_statuses (org_id, sort_index);

create unique index if not exists facility_space_statuses_org_system_kind_idx
  on facilities.space_statuses (org_id, behaves_as) where is_system = true;

-- Seed system rows for existing orgs.
insert into facilities.space_statuses (org_id, label, color, behaves_as, is_system, sort_index)
select o.id, 'Open', 'emerald', 'open', true, 0 from orgs.orgs o
on conflict (org_id, label) do nothing;

insert into facilities.space_statuses (org_id, label, color, behaves_as, is_system, sort_index)
select o.id, 'Closed', 'rose', 'closed', true, 1 from orgs.orgs o
on conflict (org_id, label) do nothing;

insert into facilities.space_statuses (org_id, label, color, behaves_as, is_system, sort_index)
select o.id, 'Archived', 'slate', 'archived', true, 2 from orgs.orgs o
on conflict (org_id, label) do nothing;

-- Auto-seed system rows when a new org is created.
create or replace function facilities.seed_space_statuses_for_org()
returns trigger
language plpgsql
as $$
begin
  insert into facilities.space_statuses (org_id, label, color, behaves_as, is_system, sort_index)
  values
    (new.id, 'Open', 'emerald', 'open', true, 0),
    (new.id, 'Closed', 'rose', 'closed', true, 1),
    (new.id, 'Archived', 'slate', 'archived', true, 2)
  on conflict (org_id, label) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_space_statuses on orgs.orgs;
create trigger seed_space_statuses
  after insert on orgs.orgs
  for each row
  execute function facilities.seed_space_statuses_for_org();

-- Protect system rows from deletion or behavior change.
create or replace function facilities.protect_system_space_statuses()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Cannot delete a system facility space status';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_system and new.behaves_as is distinct from old.behaves_as then
      raise exception 'Cannot change behaves_as on a system facility space status';
    end if;
    if old.is_system and new.is_system is distinct from true then
      raise exception 'Cannot un-system a facility space status';
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_system_space_statuses on facilities.space_statuses;
create trigger protect_system_space_statuses
  before update or delete on facilities.space_statuses
  for each row
  execute function facilities.protect_system_space_statuses();

-- updated_at touch trigger.
create or replace function facilities.touch_space_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_space_status_updated on facilities.space_statuses;
create trigger touch_space_status_updated
  before update on facilities.space_statuses
  for each row
  execute function facilities.touch_space_status_updated_at();

-- Add status_id to spaces.
alter table facilities.spaces
  add column if not exists status_id uuid references facilities.space_statuses(id) on delete restrict;

-- Backfill status_id from the existing status enum on each space.
update facilities.spaces sp
set status_id = ss.id
from facilities.space_statuses ss
where ss.org_id = sp.org_id
  and ss.behaves_as = sp.status
  and ss.is_system = true
  and sp.status_id is null;

-- Per-space label overrides are now redundant (labels live on the status row).
alter table facilities.spaces drop column if exists status_labels_json;

commit;
