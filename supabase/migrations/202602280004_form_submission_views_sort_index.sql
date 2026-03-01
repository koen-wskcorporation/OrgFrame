begin;

alter table public.org_form_submission_views
  add column if not exists sort_index integer;

with ordered as (
  select
    id,
    row_number() over (
      partition by org_id, form_id
      order by created_at asc, id asc
    ) - 1 as next_sort_index
  from public.org_form_submission_views
)
update public.org_form_submission_views as views
set sort_index = ordered.next_sort_index
from ordered
where views.id = ordered.id
  and views.sort_index is null;

alter table public.org_form_submission_views
  alter column sort_index set default 0;

update public.org_form_submission_views
set sort_index = 0
where sort_index is null;

alter table public.org_form_submission_views
  alter column sort_index set not null;

create index if not exists org_form_submission_views_org_form_sort_idx
  on public.org_form_submission_views (org_id, form_id, sort_index asc, created_at asc);

commit;

