import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

type WorkspaceActionPayload = {
  action: "update_player_profile" | "assign_player_team" | "create_practice" | "create_team";
  org_id: string;
  idempotency_key?: string;
  player_id?: string;
  field?: string;
  value?: string;
  team_id?: string;
  title?: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  facility_id?: string;
  name?: string;
  slug?: string;
  program_id?: string;
  age_group?: string;
  parent_node_id?: string;
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function successResponse(input: {
  action: WorkspaceActionPayload["action"];
  status?: "executed" | "already_applied";
  summary: string;
  updatedEntities: Array<{ type: string; id: string | null }>;
  warnings?: string[];
  requiresUserInput?: boolean;
}) {
  return json({
    ok: true,
    action_id: input.action,
    status: input.status ?? "executed",
    summary: input.summary,
    updated_entities: input.updatedEntities,
    warnings: input.warnings ?? [],
    requires_user_input: input.requiresUserInput ?? false,
  });
}

async function requireAuthorizedClient(request: Request, orgId: string, requiredPermissions: string[]) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: json({ error: "Missing Authorization header." }, 401) } as const;
  }

  const publishableKey = request.headers.get("apikey")?.trim() || SUPABASE_ANON_KEY;
  if (!publishableKey) {
    return { error: json({ error: "Missing API key." }, 500) } as const;
  }

  const userClient = createClient(SUPABASE_URL, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return { error: json({ error: "Invalid auth token." }, 401) } as const;
  }

  let allowed = false;
  for (const permission of requiredPermissions) {
    const { data: hasPermission } = await userClient.rpc("has_org_permission", {
      target_org_id: orgId,
      required_permission: permission,
    });
    if (hasPermission === true) {
      allowed = true;
      break;
    }
  }

  if (!allowed) {
    return { error: json({ error: "Forbidden." }, 403) } as const;
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return { user, service } as const;
}

function parseUtcDate(input: string): Date | null {
  const value = new Date(input);
  return Number.isNaN(value.getTime()) ? null : value;
}

function toLocalDatePart(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(value);
}

function toLocalTimePart(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(value);
}

async function updatePlayerProfile(service: ReturnType<typeof createClient>, userId: string, payload: WorkspaceActionPayload) {
  const playerId = cleanText(payload.player_id);
  const field = cleanText(payload.field);
  const value = cleanText(payload.value);
  if (!playerId || !field) {
    return json({ error: "Missing player_id or field." }, 400);
  }

  const { data: current, error: currentError } = await service
    .schema("people")
    .from("profiles")
    .select("id, org_id, metadata_json")
    .eq("org_id", payload.org_id)
    .eq("profile_type", "player")
    .eq("id", playerId)
    .maybeSingle();

  if (currentError || !current) {
    return json({ error: "Player not found in organization." }, 404);
  }

  const currentMeta =
    current.metadata_json && typeof current.metadata_json === "object" && !Array.isArray(current.metadata_json)
      ? (current.metadata_json as Record<string, unknown>)
      : {};
  const nextMeta = {
    ...currentMeta,
    [field]: value || null,
    updatedFromAi: true,
    updatedBy: userId,
  };

  const { error: updateError } = await service
    .schema("people")
    .from("profiles")
    .update({
      metadata_json: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", payload.org_id)
    .eq("id", playerId);

  if (updateError) {
    return json({ error: `Failed to update player profile: ${updateError.message}` }, 500);
  }

  return successResponse({
    action: payload.action,
    summary: `Updated player profile field ${field}.`,
    updatedEntities: [{ type: "player", id: playerId }],
  });
}

async function assignPlayerTeam(service: ReturnType<typeof createClient>, userId: string, payload: WorkspaceActionPayload) {
  const playerId = cleanText(payload.player_id);
  const teamId = cleanText(payload.team_id);
  if (!playerId || !teamId) {
    return json({ error: "Missing player_id or team_id." }, 400);
  }

  const { data: player, error: playerError } = await service
    .schema("people")
    .from("profiles")
    .select("id, org_id")
    .eq("id", playerId)
    .eq("org_id", payload.org_id)
    .eq("profile_type", "player")
    .maybeSingle();
  if (playerError || !player) {
    return json({ error: "Player not found in organization." }, 404);
  }

  const { data: team, error: teamError } = await service
    .schema("programs")
    .from("program_teams")
    .select("id, org_id, program_id")
    .eq("id", teamId)
    .eq("org_id", payload.org_id)
    .maybeSingle();

  if (teamError || !team) {
    return json({ error: "Team not found in organization." }, 404);
  }

  const { data: existing } = await service
    .schema("programs")
    .from("program_team_members")
    .select("id")
    .eq("org_id", payload.org_id)
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .in("status", ["active", "pending", "waitlisted"])
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return successResponse({
      action: payload.action,
      status: "already_applied",
      summary: "Player is already assigned to this team.",
      updatedEntities: [
        { type: "team", id: teamId },
        { type: "player", id: playerId },
      ],
    });
  }

  const { error: insertError } = await service.schema("programs").from("program_team_members").insert({
    org_id: payload.org_id,
    team_id: teamId,
    program_id: team.program_id,
    player_id: playerId,
    status: "active",
    role: "player",
    assigned_by_user_id: userId,
  });

  if (insertError) {
    return json({ error: `Failed to assign player to team: ${insertError.message}` }, 500);
  }

  return successResponse({
    action: payload.action,
    summary: "Assigned player to team.",
    updatedEntities: [
      { type: "team", id: teamId },
      { type: "player", id: playerId },
    ],
  });
}

async function createPractice(service: ReturnType<typeof createClient>, userId: string, payload: WorkspaceActionPayload) {
  const teamId = cleanText(payload.team_id);
  const title = cleanText(payload.title) || "Practice";
  const timezone = cleanText(payload.timezone) || "UTC";
  const startsAt = cleanText(payload.starts_at);
  const endsAt = cleanText(payload.ends_at);
  const facilityId = cleanText(payload.facility_id) || null;
  if (!teamId || !startsAt || !endsAt) {
    return json({ error: "Missing team_id, starts_at, or ends_at." }, 400);
  }

  const startsAtDate = parseUtcDate(startsAt);
  const endsAtDate = parseUtcDate(endsAt);
  if (!startsAtDate || !endsAtDate || endsAtDate <= startsAtDate) {
    return json({ error: "Invalid practice time window." }, 400);
  }

  const { data: team, error: teamError } = await service
    .schema("programs")
    .from("program_teams")
    .select("id, org_id")
    .eq("id", teamId)
    .eq("org_id", payload.org_id)
    .maybeSingle();

  if (teamError || !team) {
    return json({ error: "Team not found in organization." }, 404);
  }

  if (facilityId) {
    const { data: facility } = await service
      .schema("facilities")
      .from("spaces")
      .select("id")
      .eq("org_id", payload.org_id)
      .eq("id", facilityId)
      .maybeSingle();
    if (!facility) {
      return json({ error: "Facility not found in organization." }, 404);
    }
  }

  const { data: item, error: itemError } = await service
    .schema("calendar")
    .from("calendar_items")
    .insert({
      org_id: payload.org_id,
      item_type: "practice",
      title,
      visibility: "internal",
      status: "scheduled",
      timezone,
      purpose: "practices",
      audience: "private_internal",
      host_team_id: teamId,
      settings: {
        created_via: "ai_workspace_actions",
      },
      metadata: {
        idempotency_key: cleanText(payload.idempotency_key),
      },
      created_by_user_id: userId,
      updated_by_user_id: userId,
    })
    .select("id")
    .single();

  if (itemError || !item?.id) {
    return json({ error: `Failed to create calendar item: ${itemError?.message ?? "unknown"}` }, 500);
  }

  const sourceKey = `ai-practice-${item.id}-${Date.now()}`;
  const { data: occurrence, error: occurrenceError } = await service
    .schema("calendar")
    .from("calendar_item_occurrences")
    .insert({
      org_id: payload.org_id,
      item_id: item.id,
      source_rule_id: null,
      source_type: "single",
      source_key: sourceKey,
      timezone,
      local_date: toLocalDatePart(startsAtDate, timezone),
      local_start_time: toLocalTimePart(startsAtDate, timezone),
      local_end_time: toLocalTimePart(endsAtDate, timezone),
      starts_at_utc: startsAtDate.toISOString(),
      ends_at_utc: endsAtDate.toISOString(),
      status: "scheduled",
      metadata: {
        created_via: "ai_workspace_actions",
      },
      created_by_user_id: userId,
      updated_by_user_id: userId,
    })
    .select("id")
    .single();

  if (occurrenceError || !occurrence?.id) {
    return json({ error: `Failed to create occurrence: ${occurrenceError?.message ?? "unknown"}` }, 500);
  }

  if (facilityId) {
    const { error: allocationError } = await service.schema("calendar").from("calendar_item_space_allocations").insert({
      org_id: payload.org_id,
      occurrence_id: occurrence.id,
      space_id: facilityId,
      configuration_id: facilityId,
      lock_mode: "exclusive",
      allow_shared: false,
      metadata: {
        created_via: "ai_workspace_actions",
      },
      created_by_user_id: userId,
      updated_by_user_id: userId,
    });

    if (allocationError) {
      return json({ error: `Practice created, but facility allocation failed: ${allocationError.message}` }, 500);
    }
  }

  return successResponse({
    action: payload.action,
    summary: "Created practice and calendar occurrence.",
    updatedEntities: [
      { type: "team", id: teamId },
      { type: "calendar_item", id: item.id },
      { type: "occurrence", id: occurrence.id },
    ],
  });
}

async function createTeam(service: ReturnType<typeof createClient>, payload: WorkspaceActionPayload) {
  const programId = cleanText(payload.program_id);
  const name = cleanText(payload.name);
  const providedSlug = cleanText(payload.slug);
  const slug = providedSlug || slugify(name);
  const ageGroup = cleanText(payload.age_group) || null;
  const parentNodeId = cleanText(payload.parent_node_id) || null;
  const idempotencyKey = cleanText(payload.idempotency_key);

  if (!programId || !name || !slug) {
    return json({ error: "Missing program_id or team name." }, 400);
  }

  const { data: program, error: programError } = await service
    .schema("programs")
    .from("programs")
    .select("id, org_id")
    .eq("id", programId)
    .eq("org_id", payload.org_id)
    .maybeSingle();

  if (programError || !program) {
    return json({ error: "Program not found in organization." }, 404);
  }

  if (idempotencyKey) {
    const { data: existingByKey } = await service
      .schema("programs")
      .from("program_structure_nodes")
      .select("id")
      .eq("program_id", programId)
      .eq("node_kind", "team")
      .eq("settings_json->>ai_idempotency_key", idempotencyKey)
      .limit(1)
      .maybeSingle();

    if (existingByKey?.id) {
      const { data: existingTeam } = await service
        .schema("programs")
        .from("program_teams")
        .select("id")
        .eq("org_id", payload.org_id)
        .eq("program_node_id", existingByKey.id)
        .maybeSingle();

      return successResponse({
        action: payload.action,
        status: "already_applied",
        summary: "Team already created for this idempotency key.",
        updatedEntities: [
          { type: "program_node", id: existingByKey.id },
          { type: "team", id: existingTeam?.id ?? null },
        ],
      });
    }
  }

  let siblingQuery = service
    .schema("programs")
    .from("program_structure_nodes")
    .select("sort_index")
    .eq("program_id", programId)
    .eq("node_kind", "team");

  siblingQuery = parentNodeId ? siblingQuery.eq("parent_id", parentNodeId) : siblingQuery.is("parent_id", null);

  const { data: siblings } = await siblingQuery;
  const nextSortIndex = (siblings ?? []).reduce((max, row) => {
    const value = typeof row.sort_index === "number" ? row.sort_index : 0;
    return Math.max(max, value);
  }, 0) + 1;

  const { data: node, error: nodeError } = await service
    .schema("programs")
    .from("program_structure_nodes")
    .insert({
      program_id: programId,
      parent_id: parentNodeId,
      name,
      slug,
      node_kind: "team",
      sort_index: nextSortIndex,
      settings_json: {
        ai_created: true,
        ai_idempotency_key: idempotencyKey || null,
      },
    })
    .select("id")
    .single();

  if (nodeError || !node?.id) {
    return json({ error: `Failed to create team node: ${nodeError?.message ?? "unknown"}` }, 500);
  }

  const { data: team, error: teamError } = await service
    .schema("programs")
    .from("program_teams")
    .select("id")
    .eq("org_id", payload.org_id)
    .eq("program_node_id", node.id)
    .maybeSingle();

  if (teamError) {
    return json({ error: `Team creation succeeded but lookup failed: ${teamError.message}` }, 500);
  }

  if (team?.id && ageGroup) {
    const { error: teamUpdateError } = await service
      .schema("programs")
      .from("program_teams")
      .update({ age_group: ageGroup })
      .eq("org_id", payload.org_id)
      .eq("id", team.id);

    if (teamUpdateError) {
      return json({ error: `Team created but age group update failed: ${teamUpdateError.message}` }, 500);
    }
  }

  return successResponse({
    action: payload.action,
    summary: `Created team ${name}.`,
    updatedEntities: [
      { type: "program", id: programId },
      { type: "program_node", id: node.id },
      { type: "team", id: team?.id ?? null },
    ],
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = (await request.json()) as WorkspaceActionPayload;
    if (!payload.action || !payload.org_id) {
      return json({ error: "Invalid payload." }, 400);
    }

    const requiredPermissions =
      payload.action === "update_player_profile" ? ["people.write", "programs.write", "org.manage.read"] : ["programs.write", "org.manage.read"];
    const auth = await requireAuthorizedClient(request, payload.org_id, requiredPermissions);
    if ("error" in auth) {
      return auth.error;
    }

    if (payload.action === "update_player_profile") {
      return await updatePlayerProfile(auth.service, auth.user.id, payload);
    }

    if (payload.action === "assign_player_team") {
      return await assignPlayerTeam(auth.service, auth.user.id, payload);
    }

    if (payload.action === "create_practice") {
      return await createPractice(auth.service, auth.user.id, payload);
    }

    if (payload.action === "create_team") {
      return await createTeam(auth.service, payload);
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
