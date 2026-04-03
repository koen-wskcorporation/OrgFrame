begin;

create or replace function public.sync_program_team_for_node()
returns trigger
language plpgsql
set search_path = public, programs
as $$
begin
  if new.node_kind = 'team' then
    insert into programs.program_teams (org_id, program_id, program_node_id)
    select program.org_id, program.id, new.id
    from programs.programs program
    where program.id = new.program_id
    on conflict (program_node_id) do nothing;
  elsif tg_op = 'UPDATE' and old.node_kind = 'team' and new.node_kind <> 'team' then
    delete from programs.program_teams where program_node_id = new.id;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.program_nodes') is not null then
    execute 'drop trigger if exists program_nodes_team_sync on public.program_nodes';
  end if;

  if to_regclass('programs.program_structure_nodes') is not null then
    execute 'drop trigger if exists program_nodes_team_sync on programs.program_structure_nodes';
    execute 'create trigger program_nodes_team_sync
      after insert or update on programs.program_structure_nodes
      for each row
      execute procedure public.sync_program_team_for_node()';
  end if;
end $$;

commit;
