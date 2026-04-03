begin;

-- Source identity keys for strict idempotency.
alter table if exists people.players
  add column if not exists source_external_key text;

create unique index if not exists players_source_external_key_uidx
  on people.players (source_external_key)
  where source_external_key is not null;

alter table if exists programs.program_structure_nodes
  add column if not exists source_external_key text;

create unique index if not exists program_structure_nodes_source_external_key_uidx
  on programs.program_structure_nodes (source_external_key)
  where source_external_key is not null;

alter table if exists programs.program_registrations
  add column if not exists source_external_key text,
  add column if not exists tryouts_json jsonb not null default '{}'::jsonb;

create unique index if not exists program_registrations_source_external_key_uidx
  on programs.program_registrations (source_external_key)
  where source_external_key is not null;

-- Native parity links for commerce.
alter table if exists commerce.orders
  add column if not exists payer_user_id uuid references auth.users(id) on delete set null;

alter table if exists commerce.payments
  add column if not exists registration_id uuid references programs.program_registrations(id) on delete set null,
  add column if not exists player_id uuid references people.players(id) on delete set null,
  add column if not exists payer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists source_event_id text,
  add column if not exists source_event_sequence integer not null default 1,
  add column if not exists source_event_count integer not null default 1;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'commerce.payments'::regclass
      and conname = 'org_order_payments_order_id_source_payment_key_key'
  ) then
    alter table commerce.payments drop constraint org_order_payments_order_id_source_payment_key_key;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'commerce.payments'::regclass
      and conname = 'payments_order_id_source_payment_key_key'
  ) then
    alter table commerce.payments drop constraint payments_order_id_source_payment_key_key;
  end if;
end
$$;

create unique index if not exists payments_org_source_registration_uidx
  on commerce.payments (org_id, source_payment_key, registration_id)
  where source_payment_key is not null and registration_id is not null;

create index if not exists payments_registration_idx
  on commerce.payments (registration_id, payment_date desc);

create index if not exists payments_player_idx
  on commerce.payments (player_id, payment_date desc);

-- Import-run operational progress and dependency conflict metadata.
alter table if exists imports.import_runs
  add column if not exists pass_progress_json jsonb not null default '{}'::jsonb;

alter table if exists imports.import_rows
  add column if not exists dependency_stage text,
  add column if not exists dependency_reason text,
  add column if not exists blocked_by_dependency boolean not null default false;

commit;
