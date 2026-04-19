alter table public.org_pages
add column if not exists sort_index int;

with ranked_pages as (
  select
    id,
    org_id,
    row_number() over (partition by org_id order by created_at asc, id asc) - 1 as next_sort_index
  from public.org_pages
)
update public.org_pages page
set sort_index = ranked_pages.next_sort_index
from ranked_pages
where page.id = ranked_pages.id
  and page.sort_index is null;

alter table public.org_pages
alter column sort_index set not null;

create unique index if not exists org_pages_org_sort_unique_idx
on public.org_pages (org_id, sort_index);
