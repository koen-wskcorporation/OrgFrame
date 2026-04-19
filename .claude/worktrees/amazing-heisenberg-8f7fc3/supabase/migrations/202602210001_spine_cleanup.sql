begin;

-- Normalize org_nav_items foreign keys before dropping tool tables.
do $$
declare
  fk record;
begin
  if to_regclass('public.org_nav_items') is null then
    return;
  end if;

  for fk in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.org_nav_items'::regclass
      and con.contype = 'f'
      and (
        exists (
          select 1
          from unnest(con.conkey) as ck(attnum)
          join pg_attribute a
            on a.attrelid = con.conrelid
           and a.attnum = ck.attnum
          where a.attname = 'org_id'
        )
        or exists (
          select 1
          from unnest(con.conkey) as ck(attnum)
          join pg_attribute a
            on a.attrelid = con.conrelid
           and a.attnum = ck.attnum
          where a.attname = 'parent_id'
        )
      )
  loop
    execute format('alter table public.org_nav_items drop constraint if exists %I', fk.conname);
  end loop;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.org_nav_items'::regclass
      and attname = 'org_id'
      and not attisdropped
  ) then
    alter table public.org_nav_items
      add constraint org_nav_items_org_id_fkey
      foreign key (org_id) references public.orgs(id) on delete cascade;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.org_nav_items'::regclass
      and attname = 'parent_id'
      and not attisdropped
  ) then
    alter table public.org_nav_items
      add constraint org_nav_items_parent_id_fkey
      foreign key (parent_id) references public.org_nav_items(id) on delete cascade;
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.org_nav_items'::regclass
      and attname = 'sort_index'
      and not attisdropped
  ) then
    execute 'create index if not exists org_nav_items_org_sort_idx on public.org_nav_items (org_id, sort_index)';
  end if;
end $$;

-- Drop foreign keys that reference tool/form/sponsor/announcement tables.
do $$
declare
  fk record;
begin
  for fk in
    select
      src_ns.nspname as schema_name,
      src.relname as table_name,
      con.conname as constraint_name
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace ref_ns on ref_ns.oid = ref.relnamespace
    where con.contype = 'f'
      and src_ns.nspname = 'public'
      and ref_ns.nspname = 'public'
      and ref.relname = any (
        array[
          'sponsor_submissions',
          'sponsor_profiles',
          'form_definitions',
          'form_versions',
          'form_submissions',
          'form_submission_attempts',
          'org_tool_settings',
          'org_events',
          'org_announcements'
        ]
      )
  loop
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      fk.schema_name,
      fk.table_name,
      fk.constraint_name
    );
  end loop;
end $$;

-- Drop storage policies/buckets for removed surfaces when present.
do $$
declare
  policy_row record;
  bucket_name text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%sponsor-assets%'
        or coalesce(with_check, '') ilike '%sponsor-assets%'
        or coalesce(qual, '') ilike '%form-assets%'
        or coalesce(with_check, '') ilike '%form-assets%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;

  foreach bucket_name in array array['sponsor-assets', 'form-assets']
  loop
    if not exists (select 1 from storage.buckets where id = bucket_name) then
      continue;
    end if;

    begin
      if to_regprocedure('storage.empty_bucket(text)') is not null then
        perform storage.empty_bucket(bucket_name);
      end if;
    exception
      when others then
        raise notice 'storage.empty_bucket(%) failed: %', bucket_name, sqlerrm;
    end;

    begin
      if to_regprocedure('storage.delete_bucket(text)') is not null then
        perform storage.delete_bucket(bucket_name);
      else
        delete from storage.buckets where id = bucket_name;
      end if;
    exception
      when others then
        raise notice 'bucket cleanup failed for %: %', bucket_name, sqlerrm;
    end;
  end loop;
end $$;

drop table if exists public.sponsor_submissions cascade;
drop table if exists public.sponsor_profiles cascade;
drop table if exists public.form_definitions cascade;
drop table if exists public.form_versions cascade;
drop table if exists public.form_submissions cascade;
drop table if exists public.form_submission_attempts cascade;
drop table if exists public.org_tool_settings cascade;
drop table if exists public.org_events cascade;
drop table if exists public.org_announcements cascade;

drop type if exists public.sponsor_submission_status;

alter table public.orgs drop column if exists brand_secondary;

commit;
