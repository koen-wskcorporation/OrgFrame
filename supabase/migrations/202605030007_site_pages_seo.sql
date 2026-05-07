begin;

-- SEO metadata fields for site pages, surfaced through the website manager
-- and used by generateMetadata on the public route.

alter table site.pages
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists og_image_path text;

commit;
