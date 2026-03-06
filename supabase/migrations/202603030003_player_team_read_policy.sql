begin;

drop policy if exists players_guardian_read on public.players;
create policy players_guardian_read on public.players
  for select
  using (
    owner_user_id = auth.uid()
    or public.is_player_guardian(id)
    or exists (
      select 1
      from public.program_registrations registration
      where registration.player_id = players.id
        and (
          public.has_org_permission(registration.org_id, 'forms.read')
          or public.has_org_permission(registration.org_id, 'programs.read')
        )
    )
    or exists (
      select 1
      from public.program_team_members member
      where member.player_id = players.id
        and public.has_org_permission(member.org_id, 'programs.read')
    )
  );

commit;
