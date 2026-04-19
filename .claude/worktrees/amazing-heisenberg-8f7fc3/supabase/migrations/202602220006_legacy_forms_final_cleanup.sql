begin;

-- Remove any remaining legacy storage policies tied to sponsor/form buckets.
do $$
declare
  policy_row record;
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
end $$;

-- Attempt bucket cleanup when storage helper functions exist.
do $$
declare
  bucket_name text;
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

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
drop table if exists public.audit_logs cascade;
drop table if exists public.org_tool_settings cascade;
drop table if exists public.org_events cascade;
drop table if exists public.org_announcements cascade;

drop type if exists public.sponsor_submission_status;

commit;
