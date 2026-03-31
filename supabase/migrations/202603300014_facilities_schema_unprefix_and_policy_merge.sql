begin;

-- 1) Remove facility_* prefixes for core facilities domain tables.
do $$
begin
  if to_regclass('facilities.facility_spaces') is not null and to_regclass('facilities.spaces') is null then
    execute 'alter table facilities.facility_spaces rename to spaces';
  end if;

  if to_regclass('facilities.facility_space_configurations') is not null and to_regclass('facilities.space_configurations') is null then
    execute 'alter table facilities.facility_space_configurations rename to space_configurations';
  end if;

  if to_regclass('facilities.facility_reservations') is not null and to_regclass('facilities.reservations') is null then
    execute 'alter table facilities.facility_reservations rename to reservations';
  end if;

  if to_regclass('facilities.org_space_types') is not null and to_regclass('facilities.space_types') is null then
    execute 'alter table facilities.org_space_types rename to space_types';
  end if;
end
$$;

-- 2) Merge layout nodes into spaces.
-- facility_layout_nodes and facility_spaces represented overlapping space hierarchy concepts.
do $$
begin
  if to_regclass('facilities.facility_layout_nodes') is not null then
    execute $sql$
      insert into facilities.spaces (
        id,
        org_id,
        parent_space_id,
        name,
        slug,
        space_kind,
        status,
        is_bookable,
        timezone,
        capacity,
        metadata_json,
        status_labels_json,
        sort_index,
        created_at,
        updated_at
      )
      select
        node.id,
        node.org_id,
        null::uuid,
        node.name,
        left(coalesce(nullif(node.slug, ''), 'space'), 87) || '-' || substr(replace(node.id::text, '-', ''), 1, 8),
        case
          when node.node_kind in ('building', 'room', 'field', 'court') then node.node_kind
          else 'custom'
        end,
        node.status,
        node.is_bookable,
        coalesce(fac.timezone, 'UTC'),
        node.capacity,
        coalesce(node.metadata_json, '{}'::jsonb) || jsonb_build_object('layout', coalesce(node.layout_json, '{}'::jsonb), 'sourceFacilityId', node.facility_id),
        '{}'::jsonb,
        coalesce(node.sort_index, 0),
        node.created_at,
        node.updated_at
      from facilities.facility_layout_nodes node
      left join facilities.facilities fac on fac.id = node.facility_id
      where not exists (
        select 1
        from facilities.spaces existing
        where existing.id = node.id
      )
      on conflict (id) do nothing
    $sql$;

    execute $sql$
      update facilities.spaces space
      set parent_space_id = node.parent_node_id
      from facilities.facility_layout_nodes node
      where space.id = node.id
        and node.parent_node_id is not null
        and exists (
          select 1
          from facilities.spaces parent
          where parent.id = node.parent_node_id
        )
    $sql$;
  end if;
end
$$;

drop table if exists facilities.facility_layout_nodes cascade;

-- 3) Merge reservation rules + exceptions into one policies table.
do $$
begin
  if to_regclass('facilities.facility_reservation_rules') is not null and to_regclass('facilities.policies') is null then
    execute 'alter table facilities.facility_reservation_rules rename to policies';
  end if;
end
$$;

alter table if exists facilities.policies
  add column if not exists policy_kind text,
  add column if not exists rule_id uuid references facilities.policies(id) on delete cascade,
  add column if not exists source_key text,
  add column if not exists kind text,
  add column if not exists override_reservation_id uuid references facilities.reservations(id) on delete set null,
  add column if not exists payload_json jsonb not null default '{}'::jsonb;

update facilities.policies
set policy_kind = 'rule'
where policy_kind is null;

alter table facilities.policies
  alter column policy_kind set default 'rule',
  alter column policy_kind set not null;

alter table facilities.policies
  drop constraint if exists policies_policy_kind_check;

alter table facilities.policies
  add constraint policies_policy_kind_check check (policy_kind in ('rule', 'exception'));

alter table facilities.policies
  drop constraint if exists policies_kind_check;

alter table facilities.policies
  add constraint policies_kind_check check (kind is null or kind in ('skip', 'override'));

do $$
begin
  if to_regclass('facilities.facility_reservation_exceptions') is not null then
    execute $sql$
      insert into facilities.policies (
        id,
        org_id,
        space_id,
        mode,
        reservation_kind,
        default_status,
        public_label,
        internal_notes,
        timezone,
        start_date,
        end_date,
        start_time,
        end_time,
        interval_count,
        interval_unit,
        by_weekday,
        by_monthday,
        end_mode,
        until_date,
        max_occurrences,
        event_id,
        program_id,
        conflict_override,
        sort_index,
        is_active,
        config_json,
        rule_hash,
        created_by,
        created_at,
        updated_at,
        policy_kind,
        rule_id,
        source_key,
        kind,
        override_reservation_id,
        payload_json
      )
      select
        e.id,
        e.org_id,
        r.space_id,
        r.mode,
        r.reservation_kind,
        r.default_status,
        r.public_label,
        r.internal_notes,
        r.timezone,
        r.start_date,
        r.end_date,
        r.start_time,
        r.end_time,
        r.interval_count,
        r.interval_unit,
        r.by_weekday,
        r.by_monthday,
        r.end_mode,
        r.until_date,
        r.max_occurrences,
        r.event_id,
        r.program_id,
        r.conflict_override,
        r.sort_index,
        true,
        '{}'::jsonb,
        '',
        e.created_by,
        e.created_at,
        e.updated_at,
        'exception',
        e.rule_id,
        e.source_key,
        e.kind,
        e.override_reservation_id,
        e.payload_json
      from facilities.facility_reservation_exceptions e
      join facilities.policies r on r.id = e.rule_id
      on conflict (id) do nothing
    $sql$;
  end if;
end
$$;

create unique index if not exists policies_exception_unique_idx
  on facilities.policies (org_id, rule_id, source_key)
  where policy_kind = 'exception';

create index if not exists policies_rule_idx
  on facilities.policies (org_id, space_id, sort_index, created_at)
  where policy_kind = 'rule';

create index if not exists policies_rule_active_idx
  on facilities.policies (org_id, is_active, updated_at desc)
  where policy_kind = 'rule';

create index if not exists policies_exception_rule_idx
  on facilities.policies (rule_id, source_key)
  where policy_kind = 'exception';

create index if not exists policies_exception_org_idx
  on facilities.policies (org_id, created_at)
  where policy_kind = 'exception';

drop table if exists facilities.facility_reservation_exceptions cascade;

commit;
