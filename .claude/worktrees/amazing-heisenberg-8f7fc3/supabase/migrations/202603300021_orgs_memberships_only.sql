begin;

-- Keep orgs schema focused on only: orgs, memberships, governing_bodies.
alter table if exists orgs.org_memberships rename to memberships;

drop table if exists orgs.org_custom_roles cascade;
drop table if exists orgs.org_tool_settings cascade;

-- Repoint org permission helpers to memberships only.
create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  select exists (
    select 1
    from orgs.memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
  );
$$;

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
          'communications.write'
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
          'communications.read'
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
          'communications.read'
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
          'events.write'
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
          'communications.write'
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

-- Recreate dependent site policies on renamed memberships table.
drop policy if exists site_pages_member_read on site.site_pages;
create policy site_pages_member_read
on site.site_pages
for select
to authenticated
using (
  exists (
    select 1
    from orgs.memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists site_pages_member_write on site.site_pages;
create policy site_pages_member_write
on site.site_pages
for all
to authenticated
using (
  exists (
    select 1
    from orgs.memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from orgs.memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists site_page_blocks_member_read on site.site_page_blocks;
create policy site_page_blocks_member_read
on site.site_page_blocks
for select
to authenticated
using (
  exists (
    select 1
    from site.site_pages page
    join orgs.memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists site_page_blocks_member_write on site.site_page_blocks;
create policy site_page_blocks_member_write
on site.site_page_blocks
for all
to authenticated
using (
  exists (
    select 1
    from site.site_pages page
    join orgs.memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from site.site_pages page
    join orgs.memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
);

commit;
