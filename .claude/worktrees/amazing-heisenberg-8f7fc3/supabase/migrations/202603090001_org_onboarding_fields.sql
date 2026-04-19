alter table public.orgs
  add column if not exists org_type text,
  add column if not exists activity_labels text[] not null default '{}'::text[],
  add column if not exists org_size text;

update public.orgs
set activity_labels = '{}'::text[]
where activity_labels is null;

drop function if exists public.create_org_for_current_user(text, text);
drop function if exists public.create_org_for_current_user(text, text, text, text[], text, text);

create function public.create_org_for_current_user(
  input_org_name text,
  input_org_slug text,
  input_org_type text default null,
  input_activity_labels text[] default null,
  input_brand_primary text default null,
  input_org_size text default null
)
returns table (
  org_id uuid,
  org_name text,
  org_slug text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_slugs text[] := array[
    'account',
    'auth',
    'forbidden',
    '_next',
    'api',
    'favicon.ico',
    'robots.txt',
    'sitemap.xml',
    'not-found'
  ];
  normalized_name text := trim(coalesce(input_org_name, ''));
  normalized_slug text := lower(
    regexp_replace(trim(coalesce(input_org_slug, '')), '[^a-z0-9]+', '-', 'g')
  );
  sanitized_slug text := regexp_replace(normalized_slug, '(^-+|-+$)', '', 'g');
  normalized_org_type text := nullif(trim(coalesce(input_org_type, '')), '');
  normalized_brand_primary text := nullif(trim(coalesce(input_brand_primary, '')), '');
  normalized_org_size text := nullif(trim(coalesce(input_org_size, '')), '');
  normalized_activity_labels text[] := coalesce(
    array(
      select distinct lower(trim(label))
      from unnest(coalesce(input_activity_labels, '{}'::text[])) as label
      where trim(coalesce(label, '')) <> ''
      order by 1
    ),
    '{}'::text[]
  );
  created_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if char_length(normalized_name) < 2 or char_length(normalized_name) > 120 then
    raise exception 'ORG_NAME_INVALID';
  end if;

  if sanitized_slug = '' then
    raise exception 'ORG_SLUG_INVALID';
  end if;

  if char_length(sanitized_slug) < 2 or char_length(sanitized_slug) > 60 then
    raise exception 'ORG_SLUG_INVALID';
  end if;

  if sanitized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'ORG_SLUG_INVALID';
  end if;

  if sanitized_slug = any(reserved_slugs) then
    raise exception 'ORG_SLUG_RESERVED';
  end if;

  if normalized_brand_primary is not null and normalized_brand_primary !~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' then
    raise exception 'ORG_BRAND_PRIMARY_INVALID';
  end if;

  insert into public.orgs (name, slug, org_type, activity_labels, brand_primary, org_size)
  values (normalized_name, sanitized_slug, normalized_org_type, normalized_activity_labels, normalized_brand_primary, normalized_org_size)
  returning id into created_org_id;

  insert into public.org_memberships (org_id, user_id, role)
  values (created_org_id, auth.uid(), 'admin');

  insert into public.org_pages (org_id, slug, title, is_published, sort_index)
  select created_org_id, 'home', normalized_name || ' Home', true, 0
  where not exists (
    select 1
    from public.org_pages page
    where page.org_id = created_org_id
      and page.slug = 'home'
  );

  return query
  select created_org_id, normalized_name, sanitized_slug;
end;
$$;

revoke all on function public.create_org_for_current_user(text, text, text, text[], text, text) from public;
grant execute on function public.create_org_for_current_user(text, text, text, text[], text, text) to authenticated;
