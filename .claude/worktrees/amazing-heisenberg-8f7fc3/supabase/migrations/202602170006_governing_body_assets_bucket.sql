insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'governing-body-assets',
  'governing-body-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists governing_body_assets_public_read on storage.objects;
create policy governing_body_assets_public_read on storage.objects
  for select
  using (bucket_id = 'governing-body-assets');
