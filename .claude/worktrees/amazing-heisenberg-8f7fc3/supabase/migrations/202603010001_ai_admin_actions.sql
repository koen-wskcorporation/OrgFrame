begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc);
create index if not exists audit_logs_action_created_idx on public.audit_logs (action, created_at desc);

drop trigger if exists audit_logs_set_updated_at on public.audit_logs;
create trigger audit_logs_set_updated_at before update on public.audit_logs for each row execute procedure public.set_updated_at();

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select
  using (
    actor_user_id = auth.uid()
    or public.has_org_permission(org_id, 'org.manage.read')
  );

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert
  with check (
    actor_user_id = auth.uid()
    and public.has_org_permission(org_id, 'org.dashboard.read')
  );

drop policy if exists audit_logs_update on public.audit_logs;
create policy audit_logs_update on public.audit_logs
  for update
  using (
    actor_user_id = auth.uid()
    and public.has_org_permission(org_id, 'org.dashboard.read')
  )
  with check (
    actor_user_id = auth.uid()
    and public.has_org_permission(org_id, 'org.dashboard.read')
  );

create table if not exists public.ai_rate_limit_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, window_start),
  constraint ai_rate_limit_windows_request_count_nonnegative check (request_count >= 0)
);

create index if not exists ai_rate_limit_windows_updated_idx on public.ai_rate_limit_windows (updated_at desc);

drop trigger if exists ai_rate_limit_windows_set_updated_at on public.ai_rate_limit_windows;
create trigger ai_rate_limit_windows_set_updated_at before update on public.ai_rate_limit_windows for each row execute procedure public.set_updated_at();

alter table public.ai_rate_limit_windows enable row level security;

drop policy if exists ai_rate_limit_windows_select on public.ai_rate_limit_windows;
create policy ai_rate_limit_windows_select on public.ai_rate_limit_windows
  for select
  using (user_id = auth.uid());

drop policy if exists ai_rate_limit_windows_insert on public.ai_rate_limit_windows;
create policy ai_rate_limit_windows_insert on public.ai_rate_limit_windows
  for insert
  with check (user_id = auth.uid());

drop policy if exists ai_rate_limit_windows_update on public.ai_rate_limit_windows;
create policy ai_rate_limit_windows_update on public.ai_rate_limit_windows
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.consume_ai_rate_limit(
  input_user_id uuid,
  input_limit integer default 20,
  input_window_seconds integer default 300
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_window_start timestamptz;
  resolved_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if auth.uid() <> input_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if input_limit <= 0 then
    raise exception 'INVALID_LIMIT';
  end if;

  if input_window_seconds < 30 then
    raise exception 'INVALID_WINDOW';
  end if;

  resolved_window_start := to_timestamp(floor(extract(epoch from now()) / input_window_seconds) * input_window_seconds);

  insert into public.ai_rate_limit_windows as window_row (
    user_id,
    window_start,
    request_count
  )
  values (
    input_user_id,
    resolved_window_start,
    1
  )
  on conflict (user_id, window_start)
  do update set
    request_count = window_row.request_count + 1,
    updated_at = now()
  returning request_count into resolved_count;

  return query
  select
    resolved_count <= input_limit as allowed,
    greatest(input_limit - resolved_count, 0) as remaining,
    resolved_window_start + make_interval(secs => input_window_seconds) as reset_at;
end;
$$;

revoke all on function public.consume_ai_rate_limit(uuid, integer, integer) from public;
grant execute on function public.consume_ai_rate_limit(uuid, integer, integer) to authenticated;

create or replace function public.ai_apply_org_governing_body_change(
  input_org_id uuid,
  input_expected_governing_body_id uuid,
  input_next_governing_body_id uuid,
  input_actor_user_id uuid
)
returns table (
  applied boolean,
  previous_governing_body_id uuid,
  next_governing_body_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_governing_body_id uuid;
  next_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if auth.uid() <> input_actor_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if not public.has_org_permission(input_org_id, 'org.branding.write') then
    raise exception 'FORBIDDEN';
  end if;

  if input_next_governing_body_id is not null then
    if not exists (select 1 from public.governing_bodies body where body.id = input_next_governing_body_id) then
      raise exception 'INVALID_GOVERNING_BODY';
    end if;
  end if;

  select org.governing_body_id
  into current_governing_body_id
  from public.orgs org
  where org.id = input_org_id
  for update;

  if not found then
    raise exception 'ORG_NOT_FOUND';
  end if;

  if current_governing_body_id is distinct from input_expected_governing_body_id then
    raise exception 'STALE_CHANGESET';
  end if;

  update public.orgs org
  set governing_body_id = input_next_governing_body_id
  where org.id = input_org_id
  returning org.updated_at into next_updated_at;

  return query
  select
    (current_governing_body_id is distinct from input_next_governing_body_id) as applied,
    current_governing_body_id,
    input_next_governing_body_id,
    next_updated_at;
end;
$$;

revoke all on function public.ai_apply_org_governing_body_change(uuid, uuid, uuid, uuid) from public;
grant execute on function public.ai_apply_org_governing_body_change(uuid, uuid, uuid, uuid) to authenticated;

commit;
