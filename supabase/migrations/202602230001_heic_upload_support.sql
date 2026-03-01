update storage.buckets as buckets
set allowed_mime_types = (
  select array(
    select distinct mime
    from unnest(
      coalesce(buckets.allowed_mime_types, array[]::text[])
      || array['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']
    ) as mime
  )
)
where buckets.id in ('org-assets', 'org-site-assets', 'account-assets', 'governing-body-assets', 'sponsor-assets');
