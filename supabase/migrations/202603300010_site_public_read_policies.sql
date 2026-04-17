begin;

alter table if exists site.site_pages enable row level security;
alter table if exists site.site_page_blocks enable row level security;

-- Public can read published pages.
drop policy if exists site_pages_public_read on site.site_pages;
create policy site_pages_public_read
on site.site_pages
for select
to anon, authenticated
using (status = 'published' or is_published = true);

-- Org members can read all pages for their org.
drop policy if exists site_pages_member_read on site.site_pages;
create policy site_pages_member_read
on site.site_pages
for select
to authenticated
using (
  exists (
    select 1
    from core.org_memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
);

-- Members can manage pages in their org.
drop policy if exists site_pages_member_write on site.site_pages;
create policy site_pages_member_write
on site.site_pages
for all
to authenticated
using (
  exists (
    select 1
    from core.org_memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from core.org_memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
);

-- Public can read blocks for published pages.
drop policy if exists site_page_blocks_public_read on site.site_page_blocks;
create policy site_page_blocks_public_read
on site.site_page_blocks
for select
to anon, authenticated
using (
  exists (
    select 1
    from site.site_pages page
    where page.id = site_page_blocks.site_page_id
      and (page.status = 'published' or page.is_published = true)
  )
);

-- Members can read all blocks for their org pages.
drop policy if exists site_page_blocks_member_read on site.site_page_blocks;
create policy site_page_blocks_member_read
on site.site_page_blocks
for select
to authenticated
using (
  exists (
    select 1
    from site.site_pages page
    join core.org_memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
);

-- Members can manage blocks for their org pages.
drop policy if exists site_page_blocks_member_write on site.site_page_blocks;
create policy site_page_blocks_member_write
on site.site_page_blocks
for all
to authenticated
using (
  exists (
    select 1
    from site.site_pages page
    join core.org_memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from site.site_pages page
    join core.org_memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
);

commit;
