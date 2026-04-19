begin;

update public.program_nodes
set node_kind = 'division'
where node_kind = 'subdivision';

alter table public.program_nodes
  drop constraint if exists program_nodes_root_division;

alter table public.program_nodes
  drop constraint if exists program_nodes_node_kind_check;

alter table public.program_nodes
  add constraint program_nodes_node_kind_check check (node_kind in ('division', 'team'));

commit;
