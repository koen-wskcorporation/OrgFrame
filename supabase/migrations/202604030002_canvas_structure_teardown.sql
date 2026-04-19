-- Destructive migration: hard reset canvas + related facility/program/allocation structure persistence.
-- No backup policy: objects are dropped permanently.
-- Expected cascade impact includes downstream relations (for example program team structures linked to program nodes).

begin;

-- Drop compatibility/public views only when the relation is actually a view.
do $$
declare
  target record;
  kind "char";
begin
  for target in
    select *
    from (
      values
        ('public', 'program_structure_nodes'),
        ('public', 'facility_layout_nodes_v1'),
        ('public', 'program_layout_nodes_v1'),
        ('public', 'allocation_layout_nodes_v1')
    ) as refs(schema_name, object_name)
  loop
    select c.relkind
    into kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = target.schema_name
      and c.relname = target.object_name
    limit 1;

    if kind in ('v', 'm') then
      execute format('drop view if exists %I.%I', target.schema_name, target.object_name);
    end if;
  end loop;
end
$$;

-- Drop unified canvas v1 tables first.
drop table if exists public.facility_layout_nodes_v1 cascade;
drop table if exists public.program_layout_nodes_v1 cascade;
drop table if exists public.allocation_layout_nodes_v1 cascade;

-- Drop structure-core tables in facility/program/allocation domains.
drop table if exists programs.program_structure_nodes cascade;
drop table if exists facilities.spaces cascade;
drop table if exists calendar.calendar_item_space_allocations cascade;

-- Drop known orphaned trigger function from program structure sync path.
drop function if exists public.sync_program_team_for_node() cascade;

commit;
