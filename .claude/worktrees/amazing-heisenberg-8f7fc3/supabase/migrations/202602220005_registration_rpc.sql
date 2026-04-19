begin;

create or replace function public.submit_form_response(
  input_org_slug text,
  input_form_slug text,
  input_answers jsonb default '{}'::jsonb,
  input_player_entries jsonb default '[]'::jsonb,
  input_metadata jsonb default '{}'::jsonb
)
returns table (
  submission_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_org_id uuid;
  resolved_form_id uuid;
  resolved_version_id uuid;
  resolved_program_id uuid;
  resolved_form_kind text;
  resolved_target_mode text;
  resolved_locked_node_id uuid;
  form_settings jsonb;
  inserted_submission_id uuid;
  final_status text := 'submitted';
  has_waitlisted boolean := false;
  has_rejected boolean := false;
  entry jsonb;
  entry_player_id uuid;
  entry_node_id uuid;
  entry_answers jsonb;
  entry_status text;
  node_capacity integer;
  node_waitlist_enabled boolean;
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select org.id
  into resolved_org_id
  from public.orgs org
  where org.slug = lower(trim(coalesce(input_org_slug, '')))
  limit 1;

  if resolved_org_id is null then
    raise exception 'ORG_NOT_FOUND';
  end if;

  select
    form_definition.id,
    form_definition.form_kind,
    form_definition.program_id,
    form_definition.target_mode,
    form_definition.locked_program_node_id,
    form_definition.settings_json
  into
    resolved_form_id,
    resolved_form_kind,
    resolved_program_id,
    resolved_target_mode,
    resolved_locked_node_id,
    form_settings
  from public.org_forms form_definition
  where form_definition.org_id = resolved_org_id
    and form_definition.slug = lower(trim(coalesce(input_form_slug, '')))
    and form_definition.status = 'published'
  limit 1;

  if resolved_form_id is null then
    raise exception 'FORM_NOT_FOUND';
  end if;

  select version.id
  into resolved_version_id
  from public.org_form_versions version
  where version.form_id = resolved_form_id
  order by version.version_number desc
  limit 1;

  if resolved_version_id is null then
    raise exception 'FORM_VERSION_NOT_FOUND';
  end if;

  if resolved_form_kind = 'program_registration' and coalesce(jsonb_array_length(input_player_entries), 0) = 0 then
    raise exception 'PLAYER_REQUIRED';
  end if;

  insert into public.org_form_submissions (
    org_id,
    form_id,
    version_id,
    submitted_by_user_id,
    status,
    answers_json,
    metadata_json
  )
  values (
    resolved_org_id,
    resolved_form_id,
    resolved_version_id,
    auth.uid(),
    'submitted',
    coalesce(input_answers, '{}'::jsonb),
    coalesce(input_metadata, '{}'::jsonb)
  )
  returning id into inserted_submission_id;

  if resolved_form_kind = 'program_registration' then
    for entry in
      select value
      from jsonb_array_elements(coalesce(input_player_entries, '[]'::jsonb))
    loop
      entry_player_id := nullif(entry ->> 'playerId', '')::uuid;
      entry_node_id := nullif(entry ->> 'programNodeId', '')::uuid;
      entry_answers := coalesce(entry -> 'answers', '{}'::jsonb);

      if entry_player_id is null then
        raise exception 'PLAYER_REQUIRED';
      end if;

      if not public.is_player_guardian(entry_player_id) then
        raise exception 'PLAYER_ACCESS_DENIED';
      end if;

      if resolved_target_mode = 'locked' then
        entry_node_id := resolved_locked_node_id;
      end if;

      node_capacity := null;
      node_waitlist_enabled := coalesce((form_settings ->> 'waitlistEnabled')::boolean, false);

      if entry_node_id is not null then
        select node.capacity, node.waitlist_enabled
        into node_capacity, node_waitlist_enabled
        from public.program_nodes node
        where node.id = entry_node_id
          and node.program_id = resolved_program_id
        for update;

        if not found then
          raise exception 'PROGRAM_NODE_NOT_FOUND';
        end if;
      end if;

      if node_capacity is null then
        node_capacity := nullif(form_settings ->> 'capacity', '')::integer;
      end if;

      entry_status := 'submitted';

      if node_capacity is not null then
        select count(*)
        into active_count
        from public.program_registrations registration
        where registration.program_id = resolved_program_id
          and registration.status in ('submitted', 'in_review', 'approved', 'waitlisted')
          and (
            (entry_node_id is null and registration.program_node_id is null)
            or registration.program_node_id = entry_node_id
          );

        if active_count >= node_capacity then
          if node_waitlist_enabled then
            entry_status := 'waitlisted';
            has_waitlisted := true;
          else
            entry_status := 'rejected';
            has_rejected := true;
          end if;
        end if;
      end if;

      insert into public.org_form_submission_entries (
        submission_id,
        player_id,
        program_node_id,
        answers_json
      )
      values (
        inserted_submission_id,
        entry_player_id,
        entry_node_id,
        entry_answers
      );

      insert into public.program_registrations (
        org_id,
        program_id,
        program_node_id,
        player_id,
        submission_id,
        status
      )
      values (
        resolved_org_id,
        resolved_program_id,
        entry_node_id,
        entry_player_id,
        inserted_submission_id,
        entry_status
      );
    end loop;

    if has_waitlisted then
      final_status := 'waitlisted';
    elsif has_rejected then
      final_status := 'rejected';
    else
      final_status := 'submitted';
    end if;
  end if;

  update public.org_form_submissions submission
  set status = final_status
  where submission.id = inserted_submission_id;

  return query
  select inserted_submission_id, final_status;
end;
$$;

revoke all on function public.submit_form_response(text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.submit_form_response(text, text, jsonb, jsonb, jsonb) to authenticated;

commit;
