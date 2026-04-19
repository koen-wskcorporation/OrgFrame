alter table public.orgs
  add column if not exists logo_path text,
  add column if not exists icon_path text,
  add column if not exists brand_primary text,
  add column if not exists updated_at timestamptz not null default now();

-- Ensure orgs updated_at is maintained on updates.
drop trigger if exists orgs_set_updated_at on public.orgs;
create trigger orgs_set_updated_at before update on public.orgs for each row execute procedure public.set_updated_at();

-- Keep org metadata public for slug-based public pages.
drop policy if exists orgs_public_read on public.orgs;
create policy orgs_public_read on public.orgs
  for select
  using (true);

-- Explicit member read policy for authenticated org users.
drop policy if exists orgs_member_read on public.orgs;
create policy orgs_member_read on public.orgs
  for select
  using (public.is_org_member(id));

-- Branding updates are restricted to org owner/admin.
drop policy if exists orgs_admin_update_branding on public.orgs;
create policy orgs_admin_update_branding on public.orgs
  for update
  using (public.has_org_role(id, 'admin'))
  with check (public.has_org_role(id, 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-assets',
  'org-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do nothing;

drop policy if exists org_assets_member_read on storage.objects;
create policy org_assets_member_read on storage.objects
  for select
  using (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.is_org_member((split_part(name, '/', 2))::uuid)
  );

drop policy if exists org_assets_admin_insert on storage.objects;
create policy org_assets_admin_insert on storage.objects
  for insert
  with check (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_role((split_part(name, '/', 2))::uuid, 'admin')
  );

drop policy if exists org_assets_admin_update on storage.objects;
create policy org_assets_admin_update on storage.objects
  for update
  using (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_role((split_part(name, '/', 2))::uuid, 'admin')
  )
  with check (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_role((split_part(name, '/', 2))::uuid, 'admin')
  );

drop policy if exists org_assets_admin_delete on storage.objects;
create policy org_assets_admin_delete on storage.objects
  for delete
  using (
    bucket_id = 'org-assets'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 3) = 'branding'
    and public.has_org_role((split_part(name, '/', 2))::uuid, 'admin')
  );
