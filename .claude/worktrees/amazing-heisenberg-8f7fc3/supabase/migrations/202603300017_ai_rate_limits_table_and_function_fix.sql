begin;

create schema if not exists ai;

-- Normalize table location/name to ai.rate_limits.
do $$
begin
  if to_regclass('ai.rate_limits') is null then
    if to_regclass('ai.ai_rate_limit_windows') is not null then
      execute 'alter table ai.ai_rate_limit_windows rename to rate_limits';
    elsif to_regclass('public.ai_rate_limit_windows') is not null then
      execute 'alter table public.ai_rate_limit_windows set schema ai';
      if to_regclass('ai.ai_rate_limit_windows') is not null and to_regclass('ai.rate_limits') is null then
        execute 'alter table ai.ai_rate_limit_windows rename to rate_limits';
      end if;
    end if;
  end if;
end
$$;

-- Keep expected trigger/index names idempotently.
do $$
begin
  if to_regclass('ai.rate_limits') is not null then
    if exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'ai'
        and c.relname = 'rate_limits'
        and t.tgname = 'ai_rate_limit_windows_set_updated_at'
    ) then
      execute 'alter trigger ai_rate_limit_windows_set_updated_at on ai.rate_limits rename to rate_limits_set_updated_at';
    end if;

    if exists (
      select 1
      from pg_indexes
      where schemaname = 'ai'
        and tablename = 'rate_limits'
        and indexname = 'ai_rate_limit_windows_updated_idx'
    ) then
      execute 'alter index ai.ai_rate_limit_windows_updated_idx rename to rate_limits_updated_idx';
    end if;
  end if;
end
$$;

-- Ensure permissions on ai schema/table remain available for API roles.
grant usage on schema ai to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema ai to anon, authenticated;
grant all privileges on all tables in schema ai to service_role;

alter default privileges in schema ai grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema ai grant all privileges on tables to service_role;

-- Repair rate-limit function to target ai.rate_limits explicitly.
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

  insert into ai.rate_limits as window_row (
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

commit;
