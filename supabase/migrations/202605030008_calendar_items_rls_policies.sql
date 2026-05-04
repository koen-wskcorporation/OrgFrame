-- Add row-level security policies to calendar.calendar_items and
-- calendar.calendar_item_occurrences. These tables had RLS enabled in
-- 202604110001_ai_first_workspace_rls_hardening.sql but no migration in this
-- tree carried policies forward after the public→calendar schema move, so
-- inserts now fail with "new row violates row-level security policy".
--
-- Policies mirror the prior public.calendar_entries shape:
--   * Select: anyone with calendar.read/write, or a team-calendar-write role
--     when host_team_id is set, or any published+scheduled row.
--   * Write:  calendar.write at the org, or team-calendar-write when
--     host_team_id is set.

begin;

drop policy if exists calendar_items_select on calendar.calendar_items;
create policy calendar_items_select on calendar.calendar_items
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or (host_team_id is not null and public.has_team_calendar_write(host_team_id))
    or (visibility = 'published' and status = 'scheduled')
  );

drop policy if exists calendar_items_write on calendar.calendar_items;
create policy calendar_items_write on calendar.calendar_items
  for all
  using (
    public.has_org_permission(org_id, 'calendar.write')
    or (host_team_id is not null and public.has_team_calendar_write(host_team_id))
  )
  with check (
    public.has_org_permission(org_id, 'calendar.write')
    or (host_team_id is not null and public.has_team_calendar_write(host_team_id))
  );

drop policy if exists calendar_item_occurrences_select on calendar.calendar_item_occurrences;
create policy calendar_item_occurrences_select on calendar.calendar_item_occurrences
  for select
  using (
    exists (
      select 1
      from calendar.calendar_items item
      where item.id = calendar_item_occurrences.item_id
        and (
          public.has_org_permission(item.org_id, 'calendar.read')
          or public.has_org_permission(item.org_id, 'calendar.write')
          or (item.host_team_id is not null and public.has_team_calendar_write(item.host_team_id))
          or (item.visibility = 'published' and item.status = 'scheduled')
        )
    )
  );

drop policy if exists calendar_item_occurrences_write on calendar.calendar_item_occurrences;
create policy calendar_item_occurrences_write on calendar.calendar_item_occurrences
  for all
  using (
    exists (
      select 1
      from calendar.calendar_items item
      where item.id = calendar_item_occurrences.item_id
        and (
          public.has_org_permission(item.org_id, 'calendar.write')
          or (item.host_team_id is not null and public.has_team_calendar_write(item.host_team_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from calendar.calendar_items item
      where item.id = calendar_item_occurrences.item_id
        and (
          public.has_org_permission(item.org_id, 'calendar.write')
          or (item.host_team_id is not null and public.has_team_calendar_write(item.host_team_id))
        )
    )
  );

notify pgrst, 'reload schema';

commit;
