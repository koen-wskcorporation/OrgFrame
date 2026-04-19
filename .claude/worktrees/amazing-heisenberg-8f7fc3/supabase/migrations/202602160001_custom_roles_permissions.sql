create table if not exists public.org_custom_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  role_key text not null,
  label text not null,
  permissions text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, role_key)
);

create index if not exists org_custom_roles_org_idx on public.org_custom_roles (org_id, role_key);

alter table public.org_custom_roles
  add constraint org_custom_roles_role_key_check
  check (role_key ~ '^[a-z][a-z0-9-]{1,31}$')
  not valid;

alter table public.org_custom_roles validate constraint org_custom_roles_role_key_check;

alter table public.org_custom_roles
  add constraint org_custom_roles_reserved_keys_check
  check (role_key not in ('admin', 'member'))
  not valid;

alter table public.org_custom_roles validate constraint org_custom_roles_reserved_keys_check;

drop trigger if exists org_custom_roles_set_updated_at on public.org_custom_roles;
create trigger org_custom_roles_set_updated_at before update on public.org_custom_roles for each row execute procedure public.set_updated_at();

insert into public.org_custom_roles (org_id, role_key, label, permissions)
select distinct
  membership.org_id,
  'manager',
  'Manager',
  array[
    'org.dashboard.read',
    'org.manage.read',
    'org.branding.read',
    'org.pages.read',
    'org.pages.write',
    'sponsors.read',
    'sponsors.write'
  ]::text[]
from public.org_memberships membership
where membership.role = 'manager'
on conflict (org_id, role_key) do nothing;

update public.org_memberships
set role = 'admin'
where role = 'owner';

alter table public.org_memberships drop constraint if exists org_memberships_role_check;
alter table public.org_memberships drop constraint if exists org_memberships_role_key_check;
alter table public.org_memberships
  add constraint org_memberships_role_key_check
  check (role ~ '^[a-z][a-z0-9-]{1,31}$')
  not valid;

alter table public.org_memberships validate constraint org_memberships_role_key_check;

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select membership.role
    from public.org_memberships membership
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
          'sponsors.read',
          'sponsors.write'
        ]::text[]
        when 'member' then array[
          'org.dashboard.read',
          'org.branding.read',
          'sponsors.read'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from public.org_custom_roles custom_role
            where custom_role.org_id = target_org_id
              and custom_role.role_key = membership.role
            limit 1
          ),
          array[]::text[]
        )
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
set search_path = public
as $$
  select case minimum_role
    when 'member' then public.has_org_permission(target_org_id, 'org.dashboard.read')
    when 'admin' then public.has_org_permission(target_org_id, 'org.manage.read')
    when 'manager' then (
      public.has_org_permission(target_org_id, 'org.manage.read')
      or public.has_org_permission(target_org_id, 'org.pages.write')
      or public.has_org_permission(target_org_id, 'sponsors.write')
    )
    else false
  end;
$$;

alter table public.org_custom_roles enable row level security;

drop policy if exists org_custom_roles_member_read on public.org_custom_roles;
create policy org_custom_roles_member_read on public.org_custom_roles
  for select
  using (public.is_org_member(org_id));

drop policy if exists org_custom_roles_manage_write on public.org_custom_roles;
create policy org_custom_roles_manage_write on public.org_custom_roles
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_memberships_read_self_or_admin on public.org_memberships;
create policy org_memberships_read_self_or_admin on public.org_memberships
  for select
  using (user_id = auth.uid() or public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_tool_settings_admin_write on public.org_tool_settings;
create policy org_tool_settings_admin_write on public.org_tool_settings
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sponsor_submissions_manager_update on public.sponsor_submissions;
create policy sponsor_submissions_manager_update on public.sponsor_submissions
  for update
  using (public.has_org_permission(org_id, 'sponsors.write'))
  with check (public.has_org_permission(org_id, 'sponsors.write'));

drop policy if exists sponsor_assets_manage_manager on storage.objects;
create policy sponsor_assets_manage_manager on storage.objects
  for all
  using (
    bucket_id = 'sponsor-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'sponsors.write')
  )
  with check (
    bucket_id = 'sponsor-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'sponsors.write')
  );

drop policy if exists orgs_admin_update_branding on public.orgs;
create policy orgs_admin_update_branding on public.orgs
  for update
  using (public.has_org_permission(id, 'org.branding.write'))
  with check (public.has_org_permission(id, 'org.branding.write'));

drop policy if exists org_assets_admin_insert on storage.objects;
create policy org_assets_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_permission((split_part(name, '/', 2))::uuid, 'org.branding.write')
  );

drop policy if exists org_assets_admin_update on storage.objects;
create policy org_assets_admin_update on storage.objects
  for update
  using (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_permission((split_part(name, '/', 2))::uuid, 'org.branding.write')
  )
  with check (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_permission((split_part(name, '/', 2))::uuid, 'org.branding.write')
  );

drop policy if exists org_assets_admin_delete on storage.objects;
create policy org_assets_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_permission((split_part(name, '/', 2))::uuid, 'org.branding.write')
  );

drop policy if exists org_pages_public_or_manager_read on public.org_pages;
create policy org_pages_public_or_manager_read on public.org_pages
  for select
  using (is_published or public.has_org_permission(org_id, 'org.pages.read'));

drop policy if exists org_pages_manager_insert on public.org_pages;
create policy org_pages_manager_insert on public.org_pages
  for insert
  with check (public.has_org_permission(org_id, 'org.pages.write'));

drop policy if exists org_pages_manager_update on public.org_pages;
create policy org_pages_manager_update on public.org_pages
  for update
  using (public.has_org_permission(org_id, 'org.pages.write'))
  with check (public.has_org_permission(org_id, 'org.pages.write'));

drop policy if exists org_pages_manager_delete on public.org_pages;
create policy org_pages_manager_delete on public.org_pages
  for delete
  using (public.has_org_permission(org_id, 'org.pages.write'));

drop policy if exists org_page_blocks_public_or_manager_read on public.org_page_blocks;
create policy org_page_blocks_public_or_manager_read on public.org_page_blocks
  for select
  using (
    exists (
      select 1
      from public.org_pages page
      where page.id = org_page_blocks.org_page_id
        and (
          page.is_published
          or public.has_org_permission(page.org_id, 'org.pages.read')
        )
    )
  );

drop policy if exists org_page_blocks_manager_insert on public.org_page_blocks;
create policy org_page_blocks_manager_insert on public.org_page_blocks
  for insert
  with check (
    exists (
      select 1
      from public.org_pages page
      where page.id = org_page_blocks.org_page_id
        and public.has_org_permission(page.org_id, 'org.pages.write')
    )
  );

drop policy if exists org_page_blocks_manager_update on public.org_page_blocks;
create policy org_page_blocks_manager_update on public.org_page_blocks
  for update
  using (
    exists (
      select 1
      from public.org_pages page
      where page.id = org_page_blocks.org_page_id
        and public.has_org_permission(page.org_id, 'org.pages.write')
    )
  )
  with check (
    exists (
      select 1
      from public.org_pages page
      where page.id = org_page_blocks.org_page_id
        and public.has_org_permission(page.org_id, 'org.pages.write')
    )
  );

drop policy if exists org_page_blocks_manager_delete on public.org_page_blocks;
create policy org_page_blocks_manager_delete on public.org_page_blocks
  for delete
  using (
    exists (
      select 1
      from public.org_pages page
      where page.id = org_page_blocks.org_page_id
        and public.has_org_permission(page.org_id, 'org.pages.write')
    )
  );

drop policy if exists org_site_assets_manager_insert on storage.objects;
create policy org_site_assets_manager_insert on storage.objects
  for insert
  with check (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'org.pages.write')
  );

drop policy if exists org_site_assets_manager_update on storage.objects;
create policy org_site_assets_manager_update on storage.objects
  for update
  using (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'org.pages.write')
  )
  with check (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'org.pages.write')
  );

drop policy if exists org_site_assets_manager_delete on storage.objects;
create policy org_site_assets_manager_delete on storage.objects
  for delete
  using (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_permission((split_part(name, '/', 1))::uuid, 'org.pages.write')
  );

drop policy if exists org_announcements_public_or_manager_read on public.org_announcements;
create policy org_announcements_public_or_manager_read on public.org_announcements
  for select
  using (
    (is_published and (publish_at is null or publish_at <= now()))
    or public.has_org_permission(org_id, 'org.manage.read')
  );

drop policy if exists org_announcements_manager_insert on public.org_announcements;
create policy org_announcements_manager_insert on public.org_announcements
  for insert
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_announcements_manager_update on public.org_announcements;
create policy org_announcements_manager_update on public.org_announcements
  for update
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_announcements_manager_delete on public.org_announcements;
create policy org_announcements_manager_delete on public.org_announcements
  for delete
  using (public.has_org_permission(org_id, 'org.manage.read'));
