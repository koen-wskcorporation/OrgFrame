update storage.buckets
set public = true
where id = 'org-assets';

drop policy if exists org_assets_public_read on storage.objects;
create policy org_assets_public_read on storage.objects
  for select
  using (bucket_id = 'org-assets');
