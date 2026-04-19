begin;

-- 1) Remove org_* prefixes for retained commerce tables.
do $$
begin
  if to_regclass('commerce.org_orders') is not null and to_regclass('commerce.orders') is null then
    execute 'alter table commerce.org_orders rename to orders';
  end if;

  if to_regclass('commerce.org_order_payments') is not null and to_regclass('commerce.payments') is null then
    execute 'alter table commerce.org_order_payments rename to payments';
  end if;
end
$$;

-- 2) Embed order line items directly on orders.
alter table if exists commerce.orders
  add column if not exists items_json jsonb not null default '[]'::jsonb;

-- Backfill from legacy order items table when present.
do $$
begin
  if to_regclass('commerce.org_order_items') is not null then
    with item_groups as (
      select
        i.order_id,
        jsonb_agg(
          jsonb_build_object(
            'id', coalesce(i.source_line_key, i.id::text),
            'source_line_key', i.source_line_key,
            'description', i.description,
            'source_program_name', i.source_program_name,
            'source_division_name', i.source_division_name,
            'source_team_name', i.source_team_name,
            'player_id', i.player_id,
            'program_id', i.program_id,
            'division_node_id', i.division_node_id,
            'team_node_id', i.team_node_id,
            'amount', i.amount,
            'amount_paid', i.amount_paid,
            'balance_amount', i.balance_amount,
            'metadata_json', coalesce(i.metadata_json, '{}'::jsonb)
          )
          order by i.created_at asc
        ) as items_json
      from commerce.org_order_items i
      group by i.order_id
    )
    update commerce.orders o
    set items_json = g.items_json
    from item_groups g
    where g.order_id = o.id
      and (o.items_json is null or o.items_json = '[]'::jsonb);
  elsif to_regclass('commerce.order_items') is not null then
    with item_groups as (
      select
        i.order_id,
        jsonb_agg(
          jsonb_build_object(
            'id', coalesce(i.source_line_key, i.id::text),
            'source_line_key', i.source_line_key,
            'description', i.description,
            'source_program_name', i.source_program_name,
            'source_division_name', i.source_division_name,
            'source_team_name', i.source_team_name,
            'player_id', i.player_id,
            'program_id', i.program_id,
            'division_node_id', i.division_node_id,
            'team_node_id', i.team_node_id,
            'amount', i.amount,
            'amount_paid', i.amount_paid,
            'balance_amount', i.balance_amount,
            'metadata_json', coalesce(i.metadata_json, '{}'::jsonb)
          )
          order by i.created_at asc
        ) as items_json
      from commerce.order_items i
      group by i.order_id
    )
    update commerce.orders o
    set items_json = g.items_json
    from item_groups g
    where g.order_id = o.id
      and (o.items_json is null or o.items_json = '[]'::jsonb);
  end if;
end
$$;

update commerce.orders
set items_json = '[]'::jsonb
where items_json is null;

alter table commerce.orders
  alter column items_json set not null,
  alter column items_json set default '[]'::jsonb;

-- 3) Remove unused / deprecated commerce tables.
drop table if exists commerce.org_order_items cascade;
drop table if exists commerce.order_items cascade;
drop table if exists commerce.sponsor_submissions cascade;

commit;
