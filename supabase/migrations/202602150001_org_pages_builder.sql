create table if not exists public.org_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null,
  title text not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists org_pages_org_slug_idx on public.org_pages (org_id, slug);

create table if not exists public.org_page_blocks (
  id uuid primary key default gen_random_uuid(),
  org_page_id uuid not null references public.org_pages(id) on delete cascade,
  type text not null,
  sort_index int not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_page_id, sort_index)
);

create index if not exists org_page_blocks_page_sort_idx on public.org_page_blocks (org_page_id, sort_index);

drop trigger if exists org_pages_set_updated_at on public.org_pages;
create trigger org_pages_set_updated_at before update on public.org_pages for each row execute procedure public.set_updated_at();

drop trigger if exists org_page_blocks_set_updated_at on public.org_page_blocks;
create trigger org_page_blocks_set_updated_at before update on public.org_page_blocks for each row execute procedure public.set_updated_at();

alter table public.org_pages enable row level security;
alter table public.org_page_blocks enable row level security;

drop policy if exists org_pages_public_or_manager_read on public.org_pages;
create policy org_pages_public_or_manager_read on public.org_pages
  for select
  using (is_published or public.has_org_role(org_id, 'manager'));

drop policy if exists org_pages_manager_insert on public.org_pages;
create policy org_pages_manager_insert on public.org_pages
  for insert
  with check (public.has_org_role(org_id, 'manager'));

drop policy if exists org_pages_manager_update on public.org_pages;
create policy org_pages_manager_update on public.org_pages
  for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

drop policy if exists org_pages_manager_delete on public.org_pages;
create policy org_pages_manager_delete on public.org_pages
  for delete
  using (public.has_org_role(org_id, 'manager'));

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
          or public.has_org_role(page.org_id, 'manager')
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
        and public.has_org_role(page.org_id, 'manager')
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
        and public.has_org_role(page.org_id, 'manager')
    )
  )
  with check (
    exists (
      select 1
      from public.org_pages page
      where page.id = org_page_blocks.org_page_id
        and public.has_org_role(page.org_id, 'manager')
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
        and public.has_org_role(page.org_id, 'manager')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-site-assets',
  'org-site-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists org_site_assets_manager_insert on storage.objects;
create policy org_site_assets_manager_insert on storage.objects
  for insert
  with check (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_role((split_part(name, '/', 1))::uuid, 'manager')
  );

drop policy if exists org_site_assets_manager_update on storage.objects;
create policy org_site_assets_manager_update on storage.objects
  for update
  using (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_role((split_part(name, '/', 1))::uuid, 'manager')
  )
  with check (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_role((split_part(name, '/', 1))::uuid, 'manager')
  );

drop policy if exists org_site_assets_manager_delete on storage.objects;
create policy org_site_assets_manager_delete on storage.objects
  for delete
  using (
    bucket_id = 'org-site-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_role((split_part(name, '/', 1))::uuid, 'manager')
  );

insert into public.org_pages (org_id, slug, title, is_published)
select
  org.id,
  'home',
  org.name || ' Home',
  true
from public.orgs org
on conflict (org_id, slug) do nothing;

with home_pages as (
  select
    page.id as org_page_id,
    page.org_id,
    org.name as org_name,
    org.slug as org_slug
  from public.org_pages page
  join public.orgs org on org.id = page.org_id
  where page.slug = 'home'
    and not exists (
      select 1
      from public.org_page_blocks block
      where block.org_page_id = page.id
    )
)
insert into public.org_page_blocks (org_page_id, type, sort_index, config)
select
  home.org_page_id,
  seed.type,
  seed.sort_index,
  seed.config
from home_pages home
cross join lateral (
  values
    (
      'hero'::text,
      0,
      jsonb_build_object(
        'headline', home.org_name,
        'subheadline', 'Welcome to ' || home.org_name || '. Explore current programs, upcoming events, and community partnership opportunities.',
        'primaryCtaLabel', 'Sponsor With Us',
        'primaryCtaHref', '/' || home.org_slug || '/sponsors',
        'secondaryCtaLabel', 'Contact',
        'secondaryCtaHref', '/' || home.org_slug || '/sponsors',
        'backgroundImagePath', null,
        'focalX', 0.5,
        'focalY', 0.5,
        'zoom', 1
      )
    ),
    (
      'cta_grid'::text,
      1,
      jsonb_build_object(
        'title', 'Quick Links',
        'items', jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'title', 'Sponsorship Opportunities',
            'description', 'Explore active packages and ways to support our athletes.',
            'href', '/' || home.org_slug || '/sponsors'
          ),
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'title', 'Latest Announcements',
            'description', 'See key updates for families, players, and partners.',
            'href', '#announcements'
          ),
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'title', 'Season Schedule',
            'description', 'Preview upcoming game days and key dates.',
            'href', '#schedule'
          )
        )
      )
    ),
    (
      'announcements'::text,
      2,
      jsonb_build_object(
        'title', 'Announcements',
        'items', jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'title', 'Spring Season Registration Open',
            'body', 'Registration is now available for all age groups. Spots are limited and assigned first-come, first-served.',
            'dateLabel', 'This Week'
          ),
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'title', 'Volunteer Coach Orientation',
            'body', 'Orientation will be held at the main field house with training materials and schedule walk-throughs.',
            'dateLabel', 'Next Tuesday'
          )
        )
      )
    ),
    (
      'sponsors_preview'::text,
      3,
      jsonb_build_object(
        'title', 'Partner With ' || home.org_name,
        'body', 'Your sponsorship helps fund facilities, equipment, and scholarships across our programs.',
        'ctaLabel', 'Sponsor With Us',
        'ctaHref', '/' || home.org_slug || '/sponsors'
      )
    ),
    (
      'schedule_preview'::text,
      4,
      jsonb_build_object(
        'title', 'Schedule Preview',
        'body', 'Upcoming game and training highlights will appear here as your schedule tools are connected.',
        'ctaLabel', 'Contact Our Team',
        'ctaHref', '/' || home.org_slug || '/sponsors'
      )
    )
) as seed(type, sort_index, config);
