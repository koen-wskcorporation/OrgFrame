begin;

alter table public.programs
  add column if not exists cover_image_path text;

commit;
