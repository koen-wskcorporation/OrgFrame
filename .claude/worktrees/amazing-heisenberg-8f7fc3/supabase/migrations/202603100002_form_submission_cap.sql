begin;

create or replace function public.enforce_form_submission_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_form_kind text;
  resolved_settings jsonb;
  resolved_cap_enabled boolean := false;
  resolved_cap_enabled_text text;
  resolved_cap_text text;
  resolved_cap integer;
  existing_submission_count bigint;
begin
  select
    form_definition.form_kind,
    coalesce(form_definition.settings_json, '{}'::jsonb)
  into
    resolved_form_kind,
    resolved_settings
  from public.org_forms form_definition
  where form_definition.org_id = new.org_id
    and form_definition.id = new.form_id
  for update;

  if resolved_form_kind is null then
    raise exception 'FORM_NOT_FOUND';
  end if;

  if resolved_form_kind <> 'generic' then
    return new;
  end if;

  resolved_cap_enabled_text := lower(trim(coalesce(resolved_settings ->> 'submissionCapEnabled', '')));
  resolved_cap_enabled := resolved_cap_enabled_text in ('true', 't', '1', 'yes', 'on');

  if not resolved_cap_enabled then
    return new;
  end if;

  resolved_cap_text := trim(coalesce(resolved_settings ->> 'submissionCap', ''));
  if resolved_cap_text ~ '^\d+$' then
    resolved_cap := resolved_cap_text::integer;
  else
    resolved_cap := null;
  end if;

  if resolved_cap is null or resolved_cap <= 0 then
    return new;
  end if;

  select count(*)
  into existing_submission_count
  from public.org_form_submissions submission
  where submission.org_id = new.org_id
    and submission.form_id = new.form_id;

  if existing_submission_count >= resolved_cap then
    raise exception 'SUBMISSION_CAP_REACHED';
  end if;

  return new;
end;
$$;

drop trigger if exists org_form_submissions_enforce_cap on public.org_form_submissions;
create trigger org_form_submissions_enforce_cap
  before insert on public.org_form_submissions
  for each row
  execute procedure public.enforce_form_submission_cap();

create or replace function public.get_form_submission_gate(
  input_org_slug text,
  input_form_slug text
)
returns table (
  form_id uuid,
  form_kind text,
  submission_count bigint,
  submission_cap_enabled boolean,
  submission_cap integer,
  submission_cap_reached boolean,
  submission_closed_page_title text,
  submission_closed_page_description text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_org_id uuid;
  resolved_form_id uuid;
  resolved_form_kind text;
  resolved_settings jsonb;
  resolved_schema jsonb;
  resolved_submission_count bigint;
  resolved_cap_enabled boolean := false;
  resolved_cap_enabled_text text;
  resolved_cap_text text;
  resolved_cap integer;
  resolved_closed_page jsonb;
  resolved_closed_title text;
  resolved_closed_description text;
begin
  select org.id
  into resolved_org_id
  from public.orgs org
  where org.slug = lower(trim(coalesce(input_org_slug, '')))
  limit 1;

  if resolved_org_id is null then
    raise exception 'ORG_NOT_FOUND';
  end if;

  select
    form_definition.id,
    form_definition.form_kind,
    coalesce(form_definition.settings_json, '{}'::jsonb),
    coalesce(form_definition.schema_json, '{}'::jsonb)
  into
    resolved_form_id,
    resolved_form_kind,
    resolved_settings,
    resolved_schema
  from public.org_forms form_definition
  where form_definition.org_id = resolved_org_id
    and form_definition.slug = lower(trim(coalesce(input_form_slug, '')))
    and form_definition.status = 'published'
  limit 1;

  if resolved_form_id is null then
    raise exception 'FORM_NOT_FOUND';
  end if;

  select count(*)
  into resolved_submission_count
  from public.org_form_submissions submission
  where submission.org_id = resolved_org_id
    and submission.form_id = resolved_form_id;

  resolved_cap_enabled_text := lower(trim(coalesce(resolved_settings ->> 'submissionCapEnabled', '')));
  resolved_cap_enabled := resolved_form_kind = 'generic' and resolved_cap_enabled_text in ('true', 't', '1', 'yes', 'on');
  resolved_cap_text := trim(coalesce(resolved_settings ->> 'submissionCap', ''));
  if resolved_cap_text ~ '^\d+$' then
    resolved_cap := resolved_cap_text::integer;
  else
    resolved_cap := null;
  end if;

  select page.value
  into resolved_closed_page
  from jsonb_array_elements(coalesce(resolved_schema -> 'pages', '[]'::jsonb)) as page(value)
  where coalesce(page.value ->> 'pageKey', '') = 'generic_submission_closed'
  limit 1;

  resolved_closed_title := coalesce(
    nullif(trim(coalesce(resolved_closed_page ->> 'title', '')), ''),
    nullif(trim(coalesce(resolved_settings ->> 'submissionClosedPageTitle', '')), ''),
    'This form is no longer accepting submissions'
  );
  resolved_closed_description := coalesce(
    nullif(trim(coalesce(resolved_closed_page ->> 'description', '')), ''),
    nullif(trim(coalesce(resolved_settings ->> 'submissionClosedPageDescription', '')), ''),
    'The submission limit has been reached. Please contact us if you have questions.'
  );

  form_id := resolved_form_id;
  form_kind := resolved_form_kind;
  submission_count := resolved_submission_count;
  submission_cap_enabled := resolved_cap_enabled;
  submission_cap := resolved_cap;
  submission_cap_reached :=
    resolved_form_kind = 'generic'
    and resolved_cap_enabled
    and resolved_cap is not null
    and resolved_cap > 0
    and resolved_submission_count >= resolved_cap;
  submission_closed_page_title := resolved_closed_title;
  submission_closed_page_description := resolved_closed_description;
  return next;
end;
$$;

revoke all on function public.get_form_submission_gate(text, text) from public;
grant execute on function public.get_form_submission_gate(text, text) to anon;
grant execute on function public.get_form_submission_gate(text, text) to authenticated;

commit;
