alter table public.facility_spaces
add column if not exists status_labels_json jsonb not null default '{}'::jsonb;
