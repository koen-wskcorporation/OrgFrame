create or replace function public.create_org_for_current_user(input_org_name text, input_org_slug text)
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

  insert into public.orgs (name, slug)
  values (normalized_name, sanitized_slug)
  returning id into created_org_id;

  insert into public.org_memberships (org_id, user_id, role)
  values (created_org_id, auth.uid(), 'admin');

  insert into public.org_pages (org_id, slug, title, is_published, sort_index)
  values (created_org_id, 'home', normalized_name || ' Home', true, 0)
  on conflict (org_id, slug) do nothing;

  org_id := created_org_id;
  org_name := normalized_name;
  org_slug := sanitized_slug;
  return next;
end;
$$;

revoke all on function public.create_org_for_current_user(text, text) from public;
grant execute on function public.create_org_for_current_user(text, text) to authenticated;
