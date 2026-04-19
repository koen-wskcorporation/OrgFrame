begin;

-- Restore compatibility columns expected by app code after moving from legacy views.
alter table if exists site.site_pages
  add column if not exists is_published boolean,
  add column if not exists sort_index integer;

-- Backfill/normalize.
update site.site_pages
set
  is_published = case when status = 'published' then true else false end,
  sort_index = coalesce(sort_index, 0)
where is_published is distinct from (status = 'published')
   or sort_index is null;

alter table site.site_pages
  alter column is_published set default true,
  alter column is_published set not null,
  alter column sort_index set default 0,
  alter column sort_index set not null;

create or replace function site.sync_site_pages_publish_columns()
returns trigger
language plpgsql
as $$
begin
  if new.is_published is distinct from old.is_published then
    new.status := case when new.is_published then 'published' else 'draft' end;
  elsif new.status is distinct from old.status then
    new.is_published := (new.status = 'published');
  end if;

  if new.is_published is null then
    new.is_published := (coalesce(new.status, 'published') = 'published');
  end if;

  if new.sort_index is null then
    new.sort_index := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_site_pages_publish_columns on site.site_pages;
create trigger trg_sync_site_pages_publish_columns
before insert or update on site.site_pages
for each row execute function site.sync_site_pages_publish_columns();

-- Ensure insert paths with status-only or is_published-only both remain consistent.
update site.site_pages
set
  is_published = (status = 'published'),
  status = case when is_published then 'published' else 'draft' end
where is_published is distinct from (status = 'published');

-- site_page_blocks still stores site_page_id; keep app's current org_page_id usage working.
alter table if exists site.site_page_blocks
  add column if not exists org_page_id uuid;

update site.site_page_blocks
set org_page_id = coalesce(org_page_id, site_page_id)
where org_page_id is null;

alter table site.site_page_blocks
  alter column org_page_id set not null;

create index if not exists site_page_blocks_org_page_id_idx
  on site.site_page_blocks(org_page_id, sort_index);

create or replace function site.sync_site_page_blocks_page_ids()
returns trigger
language plpgsql
as $$
begin
  if new.org_page_id is null and new.site_page_id is not null then
    new.org_page_id := new.site_page_id;
  elsif new.site_page_id is null and new.org_page_id is not null then
    new.site_page_id := new.org_page_id;
  elsif new.site_page_id is distinct from new.org_page_id then
    new.site_page_id := coalesce(new.site_page_id, new.org_page_id);
    new.org_page_id := new.site_page_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_site_page_blocks_page_ids on site.site_page_blocks;
create trigger trg_sync_site_page_blocks_page_ids
before insert or update on site.site_page_blocks
for each row execute function site.sync_site_page_blocks_page_ids();

commit;
