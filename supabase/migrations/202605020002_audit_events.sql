begin;

-- ----------------------------------------------------------------------------
-- audit schema: a single org-scoped event log for the entire app.
--
-- Capture model: hybrid.
--   * DB triggers on high-value tables auto-record create/update/delete via
--     audit.fn_log_table_change(). The trigger reads actor context from
--     PostgREST request headers (x-actor-kind, x-on-behalf-of, x-request-id)
--     so AI/system actors are tagged correctly without app-level changes.
--   * App-level code calls audit.record_event(...) for business events that
--     don't map to a single row write (logins, exports, AI tool runs,
--     permission changes, etc.).
--
-- Retention: 1 year, enforced by audit.purge_expired_events() (run nightly).
-- ----------------------------------------------------------------------------

create schema if not exists audit;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_actor_kind') then
    create type audit.actor_kind as enum ('user', 'ai', 'system');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_status') then
    create type audit.status as enum ('success', 'failure');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_source') then
    create type audit.source as enum ('trigger', 'app', 'ai', 'system');
  end if;
end$$;

create table if not exists audit.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_kind audit.actor_kind not null default 'user',
  on_behalf_of_user_id uuid,
  action text not null,
  target_schema text,
  target_table text,
  target_id text,
  status audit.status not null default 'success',
  source audit.source not null default 'app',
  summary text,
  diff jsonb,
  metadata jsonb,
  request_id text,
  expires_at timestamptz not null default (now() + interval '1 year')
);

create index if not exists events_org_occurred_idx
  on audit.events (org_id, occurred_at desc);
create index if not exists events_org_actor_idx
  on audit.events (org_id, actor_user_id, occurred_at desc);
create index if not exists events_org_on_behalf_idx
  on audit.events (org_id, on_behalf_of_user_id, occurred_at desc)
  where on_behalf_of_user_id is not null;
create index if not exists events_org_target_idx
  on audit.events (org_id, target_schema, target_table, target_id);
create index if not exists events_expires_idx on audit.events (expires_at);

-- ----------------------------------------------------------------------------
-- Header readers. PostgREST exposes request headers as a JSON GUC; we read
-- them defensively so triggers also work for direct SQL writes (where the
-- GUC is missing entirely).
-- ----------------------------------------------------------------------------

create or replace function audit.request_header(header_name text)
returns text
language plpgsql
stable
as $$
declare
  raw text;
begin
  begin
    raw := current_setting('request.headers', true);
  exception when others then
    return null;
  end;
  if raw is null or raw = '' then
    return null;
  end if;
  return (raw::jsonb) ->> header_name;
end
$$;

create or replace function audit.current_actor_kind()
returns audit.actor_kind
language plpgsql
stable
as $$
declare
  hint text := audit.request_header('x-actor-kind');
begin
  if hint = 'ai' then return 'ai'::audit.actor_kind; end if;
  if hint = 'system' then return 'system'::audit.actor_kind; end if;
  return 'user'::audit.actor_kind;
end
$$;

create or replace function audit.current_on_behalf_of()
returns uuid
language plpgsql
stable
as $$
declare
  raw text := audit.request_header('x-on-behalf-of');
begin
  if raw is null or raw = '' then return null; end if;
  return raw::uuid;
exception when others then
  return null;
end
$$;

create or replace function audit.current_request_id()
returns text
language sql
stable
as $$
  select audit.request_header('x-request-id')
$$;

-- ----------------------------------------------------------------------------
-- App-level recorder. Service-role and authenticated clients both use this.
-- ----------------------------------------------------------------------------

create or replace function audit.record_event(
  p_org_id uuid,
  p_action text,
  p_target_schema text default null,
  p_target_table text default null,
  p_target_id text default null,
  p_status audit.status default 'success',
  p_source audit.source default 'app',
  p_summary text default null,
  p_diff jsonb default null,
  p_metadata jsonb default null,
  p_actor_user_id uuid default null,
  p_actor_kind audit.actor_kind default null,
  p_on_behalf_of_user_id uuid default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = audit, public
as $$
declare
  resolved_actor uuid := coalesce(p_actor_user_id, auth.uid());
  resolved_kind audit.actor_kind := coalesce(p_actor_kind, audit.current_actor_kind());
  resolved_obo uuid := coalesce(p_on_behalf_of_user_id, audit.current_on_behalf_of());
  resolved_req text := coalesce(p_request_id, audit.current_request_id());
  new_id uuid;
begin
  insert into audit.events (
    org_id, actor_user_id, actor_kind, on_behalf_of_user_id,
    action, target_schema, target_table, target_id,
    status, source, summary, diff, metadata, request_id
  ) values (
    p_org_id, resolved_actor, resolved_kind, resolved_obo,
    p_action, p_target_schema, p_target_table, p_target_id,
    p_status, p_source, p_summary, p_diff, p_metadata, resolved_req
  )
  returning id into new_id;
  return new_id;
end
$$;

grant usage on schema audit to authenticated, service_role;
grant execute on function audit.record_event(
  uuid, text, text, text, text,
  audit.status, audit.source, text, jsonb, jsonb,
  uuid, audit.actor_kind, uuid, text
) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Generic trigger function. Attach with:
--   create trigger zz_audit_<name>
--     after insert or update or delete on <schema>.<table>
--     for each row execute function audit.fn_log_table_change('<org_col>');
--
-- TG_ARGV[0] = name of the column on the row that holds org_id.
-- If the column is missing or null on both OLD and NEW, the row is skipped
-- (we never insert orphan audit rows).
-- ----------------------------------------------------------------------------

create or replace function audit.fn_log_table_change()
returns trigger
language plpgsql
security definer
set search_path = audit, public
as $$
declare
  org_col text := coalesce(TG_ARGV[0], 'org_id');
  org_value uuid;
  target_pk text;
  before_json jsonb;
  after_json jsonb;
  diff jsonb;
  action text;
begin
  -- Allow callers to suppress trigger logging when they're emitting a richer
  -- app-level event for the same change (e.g. AI tool runner).
  if audit.request_header('x-audit-skip') = 'true' then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'INSERT' then
    after_json := to_jsonb(NEW);
    org_value := nullif(after_json ->> org_col, '')::uuid;
    target_pk := after_json ->> 'id';
    diff := jsonb_build_object('after', after_json);
    action := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.create';
  elsif TG_OP = 'UPDATE' then
    before_json := to_jsonb(OLD);
    after_json := to_jsonb(NEW);
    org_value := nullif(after_json ->> org_col, '')::uuid;
    target_pk := after_json ->> 'id';
    diff := jsonb_build_object('before', before_json, 'after', after_json);
    action := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.update';
  else -- DELETE
    before_json := to_jsonb(OLD);
    org_value := nullif(before_json ->> org_col, '')::uuid;
    target_pk := before_json ->> 'id';
    diff := jsonb_build_object('before', before_json);
    action := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.delete';
  end if;

  if org_value is null then
    return coalesce(NEW, OLD);
  end if;

  perform audit.record_event(
    p_org_id => org_value,
    p_action => action,
    p_target_schema => TG_TABLE_SCHEMA,
    p_target_table => TG_TABLE_NAME,
    p_target_id => target_pk,
    p_status => 'success',
    p_source => 'trigger',
    p_diff => diff
  );

  return coalesce(NEW, OLD);
end
$$;

-- ----------------------------------------------------------------------------
-- Attach triggers to high-value tables. Each trigger is named with a `zz_`
-- prefix so it fires after other business triggers (e.g. set_updated_at).
-- ----------------------------------------------------------------------------

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('orgs',        'orgs',                  'id'),
      ('orgs',        'memberships',           'org_id'),
      ('orgs',        'custom_roles',          'org_id'),
      ('orgs',        'custom_domains',        'org_id'),
      ('people',      'profiles',              'org_id'),
      ('facilities',  'facilities',            'org_id'),
      ('facilities',  'spaces',                'org_id'),
      ('programs',    'programs',              'org_id'),
      ('programs',    'divisions',             'org_id'),
      ('forms',       'forms',                 'org_id'),
      ('events',      'events',                'org_id'),
      ('calendar',    'entries',               'org_id'),
      ('payments',    'payments',              'org_id')
    ) as t(schema_name, table_name, org_col)
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = spec.schema_name
        and table_name = spec.table_name
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = spec.schema_name
        and table_name = spec.table_name
        and column_name = spec.org_col
    ) then
      execute format(
        'drop trigger if exists zz_audit_log on %I.%I',
        spec.schema_name, spec.table_name
      );
      execute format(
        'create trigger zz_audit_log after insert or update or delete on %I.%I '
        'for each row execute function audit.fn_log_table_change(%L)',
        spec.schema_name, spec.table_name, spec.org_col
      );
    end if;
  end loop;
end$$;

-- ----------------------------------------------------------------------------
-- Retention: purge events past expires_at. Wire up via pg_cron in a separate
-- ops migration / Supabase scheduled function.
-- ----------------------------------------------------------------------------

create or replace function audit.purge_expired_events()
returns integer
language plpgsql
security definer
as $$
declare
  removed integer;
begin
  delete from audit.events where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end
$$;

grant execute on function audit.purge_expired_events() to service_role;

-- ----------------------------------------------------------------------------
-- RLS: only members with the `audit.read` permission can read; writes are
-- service-role / SECURITY DEFINER only.
-- ----------------------------------------------------------------------------

alter table audit.events enable row level security;

drop policy if exists events_read_with_permission on audit.events;
create policy events_read_with_permission
on audit.events
for select
using (public.has_org_permission(org_id, 'audit.read'));

-- No insert/update/delete policy: rows only land via audit.record_event /
-- audit.fn_log_table_change (both SECURITY DEFINER) or service-role.

grant select on audit.events to authenticated;

-- ----------------------------------------------------------------------------
-- Permission catalog: extend has_org_permission to grant `audit.read` to
-- admin/owner roles by default. Custom roles can opt in via the same
-- orgs.custom_roles.permissions array.
-- ----------------------------------------------------------------------------

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  with membership as (
    select membership.role
    from orgs.memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
    limit 1
  ),
  role_permissions as (
    select
      case
        when membership.role in ('admin', 'owner') then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.branding.write',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'events.read',
          'events.write',
          'facilities.read',
          'facilities.write',
          'calendar.read',
          'calendar.write',
          'communications.read',
          'communications.write',
          'people.read',
          'people.write',
          'data.read',
          'data.write',
          'audit.read'
        ]::text[]
        when membership.role in ('member', 'user', 'participant') then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read',
          'people.read',
          'data.read'
        ]::text[]
        when membership.role = 'manager' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'calendar.read',
          'calendar.write',
          'events.read',
          'events.write',
          'people.read',
          'data.read'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from orgs.custom_roles custom_role
            where custom_role.org_id = target_org_id
              and custom_role.role_key = membership.role
            limit 1
          ),
          array[]::text[]
        )
      end as permissions
    from membership
  )
  select exists (
    select 1
    from role_permissions
    where required_permission = any(role_permissions.permissions)
  );
$$;

-- ----------------------------------------------------------------------------
-- Expose `audit` schema to PostgREST so the app can call audit.record_event
-- via supabase.schema('audit').rpc(...) and select from audit.events.
-- ----------------------------------------------------------------------------

do $$
declare
  existing text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
  next_value text := existing;
begin
  if not exists (
    select 1 from unnest(string_to_array(existing, ',')) as x(v) where btrim(v) = 'audit'
  ) then
    next_value := existing || ',audit';
    execute format('alter role authenticator set pgrst.db_schemas = %L', next_value);
  end if;
end
$$;

notify pgrst, 'reload config';

commit;
