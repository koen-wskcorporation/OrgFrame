import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

type RequestPayload = {
  action: "apply_batch" | "cancel_run" | "undo_run";
  org_id: string;
  run_id: string;
  batch_size?: number;
};

type StageName = "account" | "player" | "guardian_link" | "program_structure" | "registration" | "order" | "payment";
type PassName = "people" | "programs" | "commerce";

type RowState = {
  accountUserId: string | null;
  playerId: string | null;
  programId: string | null;
  divisionNodeId: string | null;
  teamNodeId: string | null;
  registrationId: string | null;
  orderId: string | null;
};

type PaymentGroup = {
  key: string;
  rowIds: string[];
  leadRowId: string;
  leadRowNumber: number;
  paymentAmount: number | null;
  paidRegistrationFee: number | null;
  paidCcFee: number | null;
  paymentStatus: string | null;
  paymentDate: string | null;
};

class StageError extends Error {
  stage: StageName;
  reason: string;
  details: Record<string, unknown>;

  constructor(stage: StageName, reason: string, details: Record<string, unknown> = {}) {
    super(reason);
    this.stage = stage;
    this.reason = reason;
    this.details = details;
  }
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function logRuntime(event: string, payload: Record<string, unknown>) {
  console.error(JSON.stringify({ event, ...payload }));
}

async function findAuthUserIdByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { userId: null } as const;
  }

  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY
      }
    });

    const text = await response.text();
    const body = (() => {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

    if (!response.ok) {
      return {
        error: `auth_lookup_http_${response.status}:${typeof body.msg === "string" ? body.msg : text || "unknown"}`
      } as const;
    }

    const users = Array.isArray(body.users) ? body.users : [];
    const matched = users
      .map((value) => asObject(value))
      .find((value) => clean(value.email).toLowerCase() === normalized);

    if (matched) {
      return { userId: clean(matched.id) || null } as const;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return { userId: null } as const;
}

async function findAuthUserRecordByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { user: null } as const;
  }

  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY
      }
    });

    const text = await response.text();
    const body = (() => {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

    if (!response.ok) {
      return {
        error: `auth_lookup_http_${response.status}:${typeof body.msg === "string" ? body.msg : text || "unknown"}`
      } as const;
    }

    const users = Array.isArray(body.users) ? body.users : [];
    const matched = users
      .map((value) => asObject(value))
      .find((value) => clean(value.email).toLowerCase() === normalized);

    if (matched) {
      return { user: matched } as const;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return { user: null } as const;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function toEmail(value: unknown) {
  const normalized = clean(value).toLowerCase();
  return normalized.includes("@") && normalized.includes(".") ? normalized : "";
}

function toDateIso(value: unknown): string | null {
  const input = clean(value);
  if (!input) {
    return null;
  }

  const timestamp = Date.parse(input);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  const match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (!month || !day || !year) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function toDateOnly(value: unknown): string | null {
  const iso = toDateIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function canonicalKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildNodeSlug(baseName: string, seed: string, attempt: number) {
  const base = slugify(baseName) || "node";
  if (attempt <= 0) {
    return base;
  }

  const compactSeed = slugify(seed).replace(/-/g, "").slice(-8) || "seed";
  const suffix = `${compactSeed}${attempt}`;
  const headLength = Math.max(1, 64 - suffix.length - 1);
  return `${base.slice(0, headLength)}-${suffix}`;
}

function isSlugConflictError(message: string) {
  return (
    message.includes("program_nodes_program_id_slug_key") ||
    message.includes("program_structure_nodes_program_slug_uidx") ||
    message.includes("duplicate key value violates unique constraint")
  );
}

function getField(input: { normalized: Record<string, unknown>; raw: Record<string, unknown> }, ...aliases: string[]): string {
  for (const alias of aliases) {
    const normalizedAlias = canonicalKey(alias);
    const normalizedValue = input.normalized[normalizedAlias] ?? input.normalized[alias];
    const normalizedText = clean(normalizedValue);
    if (normalizedText) {
      return normalizedText;
    }

    for (const [rawKey, rawValue] of Object.entries(input.raw)) {
      if (canonicalKey(rawKey) !== normalizedAlias) {
        continue;
      }
      const rawText = clean(rawValue);
      if (rawText) {
        return rawText;
      }
    }
  }

  return "";
}

async function requireAuthorizedClient(request: Request, orgId: string) {
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
      persistSession: false
    },
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return { error: json({ error: "Invalid auth token." }, 401) } as const;
  }

  const { data: hasPermission, error: permissionError } = await userClient.rpc("has_org_permission", {
    target_org_id: orgId,
    required_permission: "org.manage.read"
  });

  if (permissionError || hasPermission !== true) {
    return { error: json({ error: "Forbidden." }, 403) } as const;
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return {
    user,
    service
  } as const;
}

async function getExistingStageState(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  rowIds: string[];
}) {
  const stageState = new Map<string, Partial<Record<StageName, string | null>>>();
  if (input.rowIds.length === 0) {
    return stageState;
  }

  const { data } = await input.service
    .schema("imports").from("import_apply_log")
    .select("row_id, idempotency_key, status, target_record_id")
    .eq("org_id", input.orgId)
    .eq("run_id", input.runId)
    .in("row_id", input.rowIds)
    .eq("status", "applied");

  for (const row of data ?? []) {
    const rowId = clean(row.row_id);
    const key = clean(row.idempotency_key);
    if (!rowId || !key) {
      continue;
    }

    const parts = key.split(":");
    const stage = parts.at(-1);
    if (
      stage !== "account" &&
      stage !== "player" &&
      stage !== "guardian_link" &&
      stage !== "program_structure" &&
      stage !== "registration" &&
      stage !== "order" &&
      stage !== "payment"
    ) {
      continue;
    }

    const existing = stageState.get(rowId) ?? {};
    existing[stage] = typeof row.target_record_id === "string" ? row.target_record_id : null;
    stageState.set(rowId, existing);
  }

  return stageState;
}

async function logStage(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  rowId: string;
  profileKey: string;
  stage: StageName;
  status: "applied" | "failed" | "skipped";
  targetSchema?: string | null;
  targetTable?: string | null;
  targetRecordId?: string | null;
  applyAction?: "insert" | "update" | "skip";
  message?: string | null;
  undoPayload?: Record<string, unknown> | null;
}) {
  const key = `${input.runId}:${input.rowId}:${input.stage}`;

  await input.service
    .schema("imports").from("import_apply_log")
    .upsert(
      {
        org_id: input.orgId,
        run_id: input.runId,
        row_id: input.rowId,
        profile_key: input.profileKey,
        idempotency_key: key,
        target_schema: input.targetSchema ?? null,
        target_table: input.targetTable ?? null,
        target_record_id: input.targetRecordId ?? null,
        apply_action: input.applyAction ?? (input.status === "applied" ? "insert" : "skip"),
        status: input.status,
        message: input.message ?? null,
        undo_payload_json: input.undoPayload ?? null
      },
      {
        onConflict: "org_id,idempotency_key"
      }
    );
}

async function upsertDependencyConflict(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  row: Record<string, unknown>;
  stage: StageName;
  reason: string;
  details?: Record<string, unknown>;
}) {
  const rowId = clean(input.row.id);
  const profileKey = clean(input.row.profile_key);
  const conflictType = `dependency_${input.stage}`;

  const payload = {
    failed_stage: input.stage,
    blocking_reason: input.reason,
    details: input.details ?? {},
    normalized: asObject(input.row.normalized_row_json)
  };

  const { data: existing } = await input.service
    .schema("imports").from("import_conflicts")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("run_id", input.runId)
    .eq("row_id", rowId)
    .eq("conflict_type", conflictType)
    .in("resolution_state", ["pending_ai", "needs_review"])
    .maybeSingle();

  if (existing?.id) {
    await input.service
      .schema("imports").from("import_conflicts")
      .update({
        imported_payload_json: payload,
        candidate_records_json: [],
        ai_suggestion_json: null,
        ai_confidence: null,
        ai_prompt: `Dependency failure at stage ${input.stage}`,
        resolution_state: "needs_review"
      })
      .eq("id", existing.id);
  } else {
    await input.service
      .schema("imports").from("import_conflicts")
      .insert({
        run_id: input.runId,
        row_id: rowId,
        org_id: input.orgId,
        profile_key: profileKey,
        conflict_type: conflictType,
        imported_payload_json: payload,
        candidate_records_json: [],
        resolution_state: "needs_review",
        ai_prompt: `Dependency failure at stage ${input.stage}`
      });
  }

  await input.service
    .schema("imports").from("import_rows")
    .update({
      match_status: "conflict",
      blocked_by_dependency: true,
      dependency_stage: input.stage,
      dependency_reason: input.reason
    })
    .eq("id", rowId);
}

async function resolveOrCreateAccount(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  accountCache: Map<string, string>;
  rowData: { normalized: Record<string, unknown>; raw: Record<string, unknown> };
}) {
  const userEmail = toEmail(
    getField(
      input.rowData,
      "user_email",
      "email",
      "guardian_email",
      "contact_email"
    )
  );

  if (!userEmail) {
    throw new StageError("account", "missing_user_email");
  }

  const cachedUserId = input.accountCache.get(userEmail);
  if (cachedUserId) {
    return {
      userId: cachedUserId,
      created: false
    } as const;
  }

  const firstName = getField(input.rowData, "account_first_name", "first_name") || null;
  const lastName = getField(input.rowData, "account_last_name", "last_name") || null;

  let authUserId: string | null = null;
  let wasCreated = false;
  const authLookup = await findAuthUserIdByEmail(userEmail);
  if ("error" in authLookup) {
    logRuntime("account_auth_lookup_failed", {
      org_id: input.orgId,
      email: userEmail,
      message: authLookup.error
    });
  } else if (authLookup.userId) {
    authUserId = authLookup.userId;
    input.accountCache.set(userEmail, authUserId);
  }

  if (!authUserId) {
    const created = await input.service.auth.admin.createUser({
      email: userEmail,
      email_confirm: false,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        import_source: "smart_import",
        import_org_id: input.orgId,
        import_run_id: input.runId,
        sportsconnect_imported: true,
        sportsconnect_activation_required: true
      }
    });

    if (!created.error && created.data.user?.id) {
      authUserId = created.data.user.id;
      input.accountCache.set(userEmail, authUserId);
    }

    if (created.error || !created.data.user?.id) {
      const message = (created.error?.message ?? "").toLowerCase();
      const duplicate =
        message.includes("already") ||
        message.includes("exists") ||
        message.includes("registered") ||
        created.error?.status === 422;

      if (duplicate) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const fallbackLookup = await findAuthUserIdByEmail(userEmail);
          if ("error" in fallbackLookup) {
            logRuntime("account_auth_lookup_failed_after_duplicate", {
              org_id: input.orgId,
              email: userEmail,
              attempt: attempt + 1,
              message: fallbackLookup.error
            });
          } else if (fallbackLookup.userId) {
            authUserId = fallbackLookup.userId;
            input.accountCache.set(userEmail, authUserId);
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }

    if (!authUserId) {
      logRuntime("account_create_failed", {
        org_id: input.orgId,
        email: userEmail,
        status: created.error?.status ?? null,
        code: created.error?.code ?? null,
        message: created.error?.message ?? "Unable to create auth account."
      });
      throw new StageError("account", "account_creation_failed", {
        email: userEmail,
        status: created.error?.status ?? null,
        code: created.error?.code ?? null,
        message: created.error?.message ?? "Unable to create auth account."
      });
    }

    if (created.data.user?.id && created.data.user.id === authUserId) {
      wasCreated = true;
    }
  }

  const incomingProfile = {
    first_name: firstName,
    last_name: lastName,
    phone_primary: getField(input.rowData, "telephone"),
    phone_secondary: getField(input.rowData, "cellphone"),
    phone_other: getField(input.rowData, "other_phone"),
    street_1: getField(input.rowData, "street_address"),
    street_2: getField(input.rowData, "unit"),
    city: getField(input.rowData, "city"),
    state: getField(input.rowData, "state"),
    postal_code: getField(input.rowData, "postal_code")
  } as const;
  try {
    const { data: existingProfile, error: existingProfileError } = await input.service
      .schema("people").from("users")
      .select("first_name,last_name,phone_primary,phone_secondary,phone_other,street_1,street_2,city,state,postal_code")
      .eq("user_id", authUserId)
      .maybeSingle();

    if (existingProfileError) {
      logRuntime("account_profile_lookup_failed", {
        org_id: input.orgId,
        user_id: authUserId,
        email: userEmail,
        message: existingProfileError.message
      });
      throw new StageError("account", "profile_lookup_failed", { message: existingProfileError.message });
    }

    const profilePayload: Record<string, unknown> = {
      user_id: authUserId,
      first_name: hasText(existingProfile?.first_name) ? existingProfile?.first_name : incomingProfile.first_name,
      last_name: hasText(existingProfile?.last_name) ? existingProfile?.last_name : incomingProfile.last_name,
      phone_primary: hasText(existingProfile?.phone_primary) ? existingProfile?.phone_primary : incomingProfile.phone_primary,
      phone_secondary: hasText(existingProfile?.phone_secondary) ? existingProfile?.phone_secondary : incomingProfile.phone_secondary,
      phone_other: hasText(existingProfile?.phone_other) ? existingProfile?.phone_other : incomingProfile.phone_other,
      street_1: hasText(existingProfile?.street_1) ? existingProfile?.street_1 : incomingProfile.street_1,
      street_2: hasText(existingProfile?.street_2) ? existingProfile?.street_2 : incomingProfile.street_2,
      city: hasText(existingProfile?.city) ? existingProfile?.city : incomingProfile.city,
      state: hasText(existingProfile?.state) ? existingProfile?.state : incomingProfile.state,
      postal_code: hasText(existingProfile?.postal_code) ? existingProfile?.postal_code : incomingProfile.postal_code
    };

    const { error: profileError } = await input.service
      .schema("people").from("users")
      .upsert(profilePayload, { onConflict: "user_id" });

    if (profileError) {
      logRuntime("account_profile_upsert_failed", {
        org_id: input.orgId,
        user_id: authUserId,
        email: userEmail,
        message: profileError.message
      });
      throw new StageError("account", "profile_upsert_failed", { message: profileError.message });
    }

    const { error: membershipLookupError, data: existingMembership } = await input.service
      .schema("orgs").from("memberships")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("user_id", authUserId)
      .limit(1)
      .maybeSingle();

    if (membershipLookupError) {
      logRuntime("account_membership_lookup_failed", {
        org_id: input.orgId,
        user_id: authUserId,
        email: userEmail,
        message: membershipLookupError.message
      });
      throw new StageError("account", "membership_lookup_failed", { message: membershipLookupError.message });
    }

    if (!existingMembership?.id) {
      const { error: membershipInsertError } = await input.service
        .schema("orgs").from("memberships")
        .insert({
          org_id: input.orgId,
          user_id: authUserId,
          role: "member"
        });

      if (membershipInsertError) {
        logRuntime("account_membership_insert_failed", {
          org_id: input.orgId,
          user_id: authUserId,
          email: userEmail,
          message: membershipInsertError.message
        });
        throw new StageError("account", "membership_insert_failed", { message: membershipInsertError.message });
      }
    }
  } catch (error) {
    if (wasCreated && authUserId) {
      const rollback = await input.service.auth.admin.deleteUser(authUserId);
      if (rollback.error) {
        logRuntime("account_create_rollback_failed", {
          org_id: input.orgId,
          user_id: authUserId,
          email: userEmail,
          message: rollback.error.message
        });
      } else {
        logRuntime("account_create_rollback_applied", {
          org_id: input.orgId,
          user_id: authUserId,
          email: userEmail
        });
      }
    }

    throw error;
  }

  return {
    userId: authUserId,
    created: wasCreated
  } as const;
}

async function resolveOrCreatePlayer(input: {
  service: ReturnType<typeof createClient>;
  accountUserId: string;
  orgId: string;
  rowData: { normalized: Record<string, unknown>; raw: Record<string, unknown> };
}) {
  const firstName = getField(input.rowData, "player_first_name", "first_name") || "Imported";
  const lastName = getField(input.rowData, "player_last_name", "last_name") || "Player";
  const playerExternalId =
    getField(input.rowData, "player_id") ||
    getField(input.rowData, "association_player_id") ||
    getField(input.rowData, "order_detail_player_id") ||
    "";

  const fallbackKey = `${input.orgId}:${firstName.toLowerCase()}:${lastName.toLowerCase()}:${getField(input.rowData, "player_birth_date", "player_birth_date_time_stamp", "birth_date_time_stamp")}`;
  const sourceExternalKey = playerExternalId
    ? `sportsconnect:player:${input.orgId}:${playerExternalId}`
    : `sportsconnect:player:${fallbackKey}`;

  const { data: existing } = await input.service
    .schema("people").from("players")
    .select("id")
    .eq("source_external_key", sourceExternalKey)
    .limit(1)
    .maybeSingle();

  const payload = {
    owner_user_id: input.accountUserId,
    first_name: firstName,
    last_name: lastName,
    preferred_name: getField(input.rowData, "player_middle_initial") || null,
    date_of_birth: toDateOnly(getField(input.rowData, "player_birth_date", "player_birth_date_time_stamp", "birth_date_time_stamp")),
    gender: getField(input.rowData, "player_gender") || null,
    jersey_size: getField(input.rowData, "jersey_size") || null,
    medical_notes: [
      getField(input.rowData, "player_evaluation_comment"),
      getField(input.rowData, "special_player_request")
    ]
      .filter(Boolean)
      .join(" | ") || null,
    allergies: getField(input.rowData, "player_allergies") || null,
    physical_conditions: getField(input.rowData, "player_physical_conditions") || null,
    insurance_company: getField(input.rowData, "player_insurance_company") || null,
    insurance_policy_holder: getField(input.rowData, "player_insurance_policy_holder") || null,
    source_external_key: sourceExternalKey,
    metadata_json: {
      import_source: "smart_import",
      insurance_policy_number: getField(input.rowData, "player_insurance_policy_number") || null,
      player_email: getField(input.rowData, "player_email") || null,
      player_jersey_number: getField(input.rowData, "player_jersey_number") || null,
      weight: getField(input.rowData, "weight") || null
    }
  };

  if (existing?.id) {
    const { data: updated, error } = await input.service
      .schema("people").from("players")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error || !updated?.id) {
      throw new StageError("player", "player_update_failed", { message: error?.message ?? "update failed" });
    }

    return {
      playerId: String(updated.id),
      created: false
    } as const;
  }

  const { data: created, error } = await input.service
    .schema("people").from("players")
    .insert(payload)
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new StageError("player", "player_create_failed", { message: error?.message ?? "insert failed" });
  }

  return {
    playerId: String(created.id),
    created: true
  } as const;
}

async function ensureGuardianLink(input: {
  service: ReturnType<typeof createClient>;
  playerId: string;
  guardianUserId: string;
}) {
  const { error } = await input.service
    .schema("people").from("player_guardians")
    .upsert(
      {
        player_id: input.playerId,
        guardian_user_id: input.guardianUserId,
        relationship: "parent",
        can_manage: true
      },
      { onConflict: "player_id,guardian_user_id" }
    );

  if (error) {
    throw new StageError("guardian_link", "guardian_link_failed", { message: error.message });
  }
}

async function resolveOrCreateProgramStructure(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  rowData: { normalized: Record<string, unknown>; raw: Record<string, unknown> };
}) {
  const programName =
    getField(input.rowData, "program_name") ||
    getField(input.rowData, "order_detail_program_name") ||
    "Imported Program";
  const divisionName = getField(input.rowData, "division_name") || "General Division";
  const teamName = getField(input.rowData, "team_name");

  const programExternal = getField(input.rowData, "program_id") || programName.toLowerCase();
  const programSourceKey = `sportsconnect:program:${input.orgId}:${programExternal}`;

  let programId: string | null = null;
  let programCreated = false;
  let divisionCreatedId: string | null = null;
  let teamCreatedId: string | null = null;

  const { data: existingProgramBySource } = await input.service
    .schema("programs").from("programs")
    .select("id")
    .eq("org_id", input.orgId)
    .contains("settings_json", { source_external_key: programSourceKey })
    .limit(1)
    .maybeSingle();

  if (existingProgramBySource?.id) {
    programId = String(existingProgramBySource.id);
  }

  if (!programId) {
    const { data: existingProgramByName } = await input.service
      .schema("programs").from("programs")
      .select("id")
      .eq("org_id", input.orgId)
      .ilike("name", programName)
      .limit(1)
      .maybeSingle();

    if (existingProgramByName?.id) {
      programId = String(existingProgramByName.id);
      await input.service
        .schema("programs").from("programs")
        .update({
          settings_json: {
            source_external_key: programSourceKey,
            import_source: "smart_import"
          }
        })
        .eq("id", programId);
    }
  }

  if (!programId) {
    const { data: createdProgram, error: programError } = await input.service
      .schema("programs").from("programs")
      .insert({
        org_id: input.orgId,
        slug: slugify(`${programName}-${input.orgId.slice(0, 6)}`) || `import-${input.orgId.slice(0, 6)}`,
        name: programName,
        status: "draft",
        program_type: "custom",
        custom_type_label: "Imported",
        settings_json: {
          source_external_key: programSourceKey,
          import_source: "smart_import"
        }
      })
      .select("id")
      .single();

    if (programError || !createdProgram?.id) {
      throw new StageError("program_structure", "program_create_failed", { message: programError?.message ?? "create failed" });
    }

    programId = String(createdProgram.id);
    programCreated = true;
  }

  const divisionExternal = getField(input.rowData, "division_id") || `${programId}:${divisionName.toLowerCase()}`;
  const divisionSourceKey = `sportsconnect:division:${input.orgId}:${divisionExternal}`;

  let divisionNodeId: string | null = null;
  const { data: existingDivisionBySource } = await input.service
    .schema("programs").from("program_structure_nodes")
    .select("id")
    .eq("program_id", programId)
    .eq("source_external_key", divisionSourceKey)
    .limit(1)
    .maybeSingle();

  if (existingDivisionBySource?.id) {
    divisionNodeId = String(existingDivisionBySource.id);
  }

  if (!divisionNodeId) {
    const { data: existingDivisionByName } = await input.service
      .schema("programs").from("program_structure_nodes")
      .select("id")
      .eq("program_id", programId)
      .is("parent_id", null)
      .ilike("name", divisionName)
      .limit(1)
      .maybeSingle();

    if (existingDivisionByName?.id) {
      divisionNodeId = String(existingDivisionByName.id);
      await input.service
        .schema("programs").from("program_structure_nodes")
        .update({ source_external_key: divisionSourceKey })
        .eq("id", divisionNodeId);
    }
  }

  if (!divisionNodeId) {
    let createdDivisionId: string | null = null;
    let lastDivisionErrorMessage = "create failed";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: createdDivision, error: divisionError } = await input.service
        .schema("programs").from("program_structure_nodes")
        .insert({
          program_id: programId,
          parent_id: null,
          name: divisionName,
          slug: buildNodeSlug(divisionName, divisionSourceKey, attempt),
          node_kind: "division",
          source_external_key: divisionSourceKey,
          settings_json: {
            import_source: "smart_import"
          }
        })
        .select("id")
        .single();

      if (!divisionError && createdDivision?.id) {
        createdDivisionId = String(createdDivision.id);
        break;
      }

      lastDivisionErrorMessage = divisionError?.message ?? "create failed";
      if (!isSlugConflictError(lastDivisionErrorMessage)) {
        break;
      }
    }

    if (!createdDivisionId) {
      throw new StageError("program_structure", "division_create_failed", { message: lastDivisionErrorMessage });
    }

    divisionNodeId = createdDivisionId;
    divisionCreatedId = divisionNodeId;
  }

  let teamNodeId: string | null = null;
  if (teamName) {
    const teamSourceKey = `sportsconnect:team:${input.orgId}:${programId}:${divisionNodeId}:${teamName.toLowerCase()}`;

    const { data: existingTeamBySource } = await input.service
      .schema("programs").from("program_structure_nodes")
      .select("id")
      .eq("program_id", programId)
      .eq("source_external_key", teamSourceKey)
      .limit(1)
      .maybeSingle();

    if (existingTeamBySource?.id) {
      teamNodeId = String(existingTeamBySource.id);
    }

    if (!teamNodeId) {
      const { data: existingTeamByName } = await input.service
        .schema("programs").from("program_structure_nodes")
        .select("id")
        .eq("program_id", programId)
        .eq("parent_id", divisionNodeId)
        .ilike("name", teamName)
        .limit(1)
        .maybeSingle();

      if (existingTeamByName?.id) {
        teamNodeId = String(existingTeamByName.id);
        await input.service
          .schema("programs").from("program_structure_nodes")
          .update({ source_external_key: teamSourceKey })
          .eq("id", teamNodeId);
      }
    }

    if (!teamNodeId) {
      let createdTeamId: string | null = null;
      let lastTeamErrorMessage = "create failed";

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data: createdTeam, error: teamError } = await input.service
          .schema("programs").from("program_structure_nodes")
          .insert({
            program_id: programId,
            parent_id: divisionNodeId,
            name: teamName,
            slug: buildNodeSlug(teamName, teamSourceKey, attempt),
            node_kind: "team",
            source_external_key: teamSourceKey,
            settings_json: {
              import_source: "smart_import"
            }
          })
          .select("id")
          .single();

        if (!teamError && createdTeam?.id) {
          createdTeamId = String(createdTeam.id);
          break;
        }

        lastTeamErrorMessage = teamError?.message ?? "create failed";
        if (!isSlugConflictError(lastTeamErrorMessage)) {
          break;
        }
      }

      if (!createdTeamId) {
        const message = lastTeamErrorMessage;
        if (message.includes("public.program_teams") && message.includes("does not exist")) {
          logRuntime("program_structure_legacy_team_sync_missing_relation", {
            org_id: input.orgId,
            program_id: programId,
            division_node_id: divisionNodeId,
            team_name: teamName,
            message
          });
          teamNodeId = null;
        } else {
          throw new StageError("program_structure", "team_create_failed", { message });
        }
      } else {
        teamNodeId = createdTeamId;
        teamCreatedId = teamNodeId;
      }
    }
  }

  return {
    programId,
    divisionNodeId,
    teamNodeId,
    programCreated,
    divisionCreatedId,
    teamCreatedId
  };
}

async function ensureImportSubmission(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  createdByUserId: string;
  submittedByUserId: string;
  programId: string;
  programNodeId: string | null;
  playerId: string;
}) {
  let formId: string | null = null;
  let createdFormId: string | null = null;
  let createdVersionId: string | null = null;
  const { data: existingForm } = await input.service
    .schema("forms").from("org_forms")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("program_id", input.programId)
    .contains("settings_json", { import_source: "smart_import" })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingForm?.id) {
    formId = String(existingForm.id);
  }

  if (!formId) {
    const { data: createdForm, error } = await input.service
      .schema("forms").from("org_forms")
      .insert({
        org_id: input.orgId,
        slug: slugify(`import-${input.programId.slice(0, 8)}-${Date.now()}`),
        name: "Imported Registration Form",
        description: "Generated by Smart Import",
        form_kind: "program_registration",
        status: "published",
        program_id: input.programId,
        target_mode: "choice",
        schema_json: {},
        ui_json: {},
        settings_json: {
          import_source: "smart_import",
          run_id: input.runId
        },
        created_by: input.createdByUserId
      })
      .select("id")
      .single();

    if (error || !createdForm?.id) {
      throw new StageError("registration", "form_create_failed", { message: error?.message ?? "create failed" });
    }

    formId = String(createdForm.id);
    createdFormId = formId;
  }

  let versionId: string | null = null;
  const { data: existingVersion } = await input.service
    .schema("forms").from("org_form_versions")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("form_id", formId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingVersion?.id) {
    versionId = String(existingVersion.id);
  }

  if (!versionId) {
    const { data: createdVersion, error } = await input.service
      .schema("forms").from("org_form_versions")
      .insert({
        org_id: input.orgId,
        form_id: formId,
        version_number: 1,
        snapshot_json: {},
        created_by: input.createdByUserId
      })
      .select("id")
      .single();

    if (error || !createdVersion?.id) {
      throw new StageError("registration", "form_version_create_failed", { message: error?.message ?? "create failed" });
    }

    versionId = String(createdVersion.id);
    createdVersionId = versionId;
  }

  const { data: submission, error: submissionError } = await input.service
    .schema("forms").from("org_form_submissions")
    .insert({
      org_id: input.orgId,
      form_id: formId,
      version_id: versionId,
      submitted_by_user_id: input.submittedByUserId,
      status: "submitted",
      answers_json: {},
      metadata_json: {
        import_source: "smart_import",
        run_id: input.runId
      }
    })
    .select("id")
    .single();

  if (submissionError || !submission?.id) {
    throw new StageError("registration", "submission_create_failed", { message: submissionError?.message ?? "create failed" });
  }

  const submissionId = String(submission.id);

  await input.service
    .schema("forms").from("org_form_submission_players")
    .upsert(
      {
        submission_id: submissionId,
        player_id: input.playerId,
        program_node_id: input.programNodeId,
        answers_json: {}
      },
      { onConflict: "submission_id,player_id" }
    );

  return {
    submissionId,
    createdFormId,
    createdVersionId
  } as const;
}

async function resolveOrCreateRegistration(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  createdByUserId: string;
  playerId: string;
  submittedByUserId: string;
  programId: string;
  programNodeId: string | null;
  rowData: { normalized: Record<string, unknown>; raw: Record<string, unknown> };
}) {
  const externalRegistrationId = getField(input.rowData, "registration_number") || "";
  const sourceExternalKey = externalRegistrationId
    ? `sportsconnect:registration:${input.orgId}:${externalRegistrationId}`
    : `sportsconnect:registration:${input.orgId}:${input.programId}:${input.playerId}:${input.programNodeId ?? "root"}`;

  const { data: existingBySource } = await input.service
    .schema("programs").from("program_registrations")
    .select("id")
    .eq("source_external_key", sourceExternalKey)
    .limit(1)
    .maybeSingle();

  if (existingBySource?.id) {
    return {
      registrationId: String(existingBySource.id),
      created: false,
      createdSubmissionId: null,
      createdFormId: null,
      createdVersionId: null
    } as const;
  }

  const { data: existingByTuple } = await input.service
    .schema("programs").from("program_registrations")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("program_id", input.programId)
    .eq("player_id", input.playerId)
    .is("program_node_id", input.programNodeId)
    .in("status", ["submitted", "in_review", "approved", "waitlisted"])
    .limit(1)
    .maybeSingle();

  if (existingByTuple?.id) {
    await input.service
      .schema("programs").from("program_registrations")
      .update({
        source_external_key: sourceExternalKey,
        tryouts_json: {
          race_estimated_finish_time: getField(input.rowData, "race_estimated_finish_time") || null,
          tryout_acceptance_status: getField(input.rowData, "tryout_acceptance_status") || null,
          tryout_acceptance_email_status: getField(input.rowData, "tryout_acceptance_email_status") || null,
          tryout_rejection_email_sent: getField(input.rowData, "tryout_rejection_email_sent") || null,
          player_evaluation_comment: getField(input.rowData, "player_evaluation_comment") || null,
          player_evaluation_rating: getField(input.rowData, "player_evaluation_rating") || null
        }
      })
      .eq("id", existingByTuple.id);

    return {
      registrationId: String(existingByTuple.id),
      created: false,
      createdSubmissionId: null,
      createdFormId: null,
      createdVersionId: null
    } as const;
  }

  const submission = await ensureImportSubmission({
    service: input.service,
    orgId: input.orgId,
    runId: input.runId,
    createdByUserId: input.createdByUserId,
    submittedByUserId: input.submittedByUserId,
    programId: input.programId,
    programNodeId: input.programNodeId,
    playerId: input.playerId
  });

  const { data: created, error } = await input.service
    .schema("programs").from("program_registrations")
    .insert({
      org_id: input.orgId,
      program_id: input.programId,
      program_node_id: input.programNodeId,
      player_id: input.playerId,
      submission_id: submission.submissionId,
      status: "submitted",
      source_external_key: sourceExternalKey,
      tryouts_json: {
        race_estimated_finish_time: getField(input.rowData, "race_estimated_finish_time") || null,
        tryout_acceptance_status: getField(input.rowData, "tryout_acceptance_status") || null,
        tryout_acceptance_email_status: getField(input.rowData, "tryout_acceptance_email_status") || null,
        tryout_rejection_email_sent: getField(input.rowData, "tryout_rejection_email_sent") || null,
        player_evaluation_comment: getField(input.rowData, "player_evaluation_comment") || null,
        player_evaluation_rating: getField(input.rowData, "player_evaluation_rating") || null
      }
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new StageError("registration", "registration_create_failed", { message: error?.message ?? "create failed" });
  }

  return {
    registrationId: String(created.id),
    created: true,
    createdSubmissionId: submission.submissionId,
    createdFormId: submission.createdFormId,
    createdVersionId: submission.createdVersionId
  } as const;
}

async function resolveOrCreateOrder(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  payerUserId: string;
  playerId: string;
  registrationId: string;
  rowData: { normalized: Record<string, unknown>; raw: Record<string, unknown> };
}) {
  const sourceOrderId =
    getField(input.rowData, "order_id") ||
    getField(input.rowData, "source_order_id") ||
    getField(input.rowData, "oph_order_id") ||
    `import-order-${input.runId.slice(0, 8)}`;

  const sourceOrderNo = getField(input.rowData, "order_no", "source_order_no") || null;

  const paymentStatus = getField(input.rowData, "order_payment_status") || null;
  const orderStatus = getField(input.rowData, "order_status") || null;
  const orderDate = toDateIso(getField(input.rowData, "order_date", "order_time_stamp"));

  const item = {
    id: getField(input.rowData, "order_detail_id") || getField(input.rowData, "registration_number") || `line-${input.registrationId}`,
    source_line_key: getField(input.rowData, "order_detail_id") || getField(input.rowData, "registration_number") || `line-${input.registrationId}`,
    description: getField(input.rowData, "order_detail_description") || null,
    source_program_name: getField(input.rowData, "order_detail_program_name", "program_name") || null,
    source_division_name: getField(input.rowData, "order_detail_division_name", "division_name") || null,
    source_team_name: getField(input.rowData, "team_name") || null,
    amount: toNumber(getField(input.rowData, "orderitem_amount")),
    amount_paid: toNumber(getField(input.rowData, "orderitem_amount_paid")),
    balance_amount: toNumber(getField(input.rowData, "orderitem_balance")),
    metadata_json: {
      player_id: input.playerId,
      registration_id: input.registrationId
    }
  };

  const { data: existing } = await input.service
    .schema("commerce").from("orders")
    .select("id, items_json")
    .eq("org_id", input.orgId)
    .eq("source_system", "sportsconnect")
    .eq("source_order_id", sourceOrderId)
    .limit(1)
    .maybeSingle();

  let itemsJson: Record<string, unknown>[] = [item];
  let orderId: string | null = null;
  let existed = false;

  if (existing?.id) {
    orderId = String(existing.id);
    existed = true;

    if (Array.isArray(existing.items_json)) {
      const existingItems = existing.items_json
        .map((value) => asObject(value))
        .filter((value) => clean(value.source_line_key).length > 0);

      const hasItem = existingItems.some((value) => clean(value.source_line_key) === item.source_line_key);
      itemsJson = hasItem ? existingItems : [...existingItems, item];
    }
  }

  const orderPayload = {
    org_id: input.orgId,
    source_system: "sportsconnect",
    source_order_id: sourceOrderId,
    source_order_no: sourceOrderNo,
    source_payment_status: paymentStatus,
    order_status: orderStatus,
    order_date: orderDate,
    order_time_stamp: orderDate,
    billing_first_name: getField(input.rowData, "billing_first_name") || null,
    billing_last_name: getField(input.rowData, "billing_last_name") || null,
    billing_address: getField(input.rowData, "billing_address") || null,
    total_amount: toNumber(getField(input.rowData, "order_amount")),
    total_paid_amount: toNumber(getField(input.rowData, "total_payment_amount")),
    balance_amount: toNumber(getField(input.rowData, "orderitem_balance")),
    payer_user_id: input.payerUserId,
    items_json: itemsJson,
    metadata_json: {
      import_source: "smart_import",
      run_id: input.runId,
      player_id: input.playerId,
      registration_id: input.registrationId
    }
  };

  const { data: upserted, error } = await input.service
    .schema("commerce").from("orders")
    .upsert(orderPayload, {
      onConflict: "org_id,source_system,source_order_id"
    })
    .select("id")
    .single();

  if (error || !upserted?.id) {
    throw new StageError("order", "order_upsert_failed", { message: error?.message ?? "upsert failed" });
  }

  return {
    orderId: String(upserted.id),
    created: !existed
  } as const;
}

function buildPaymentGroups(rows: Array<Record<string, unknown>>) {
  const groups = new Map<string, PaymentGroup>();

  for (const row of rows) {
    const rowId = clean(row.id);
    const rowData = {
      normalized: asObject(row.normalized_row_json),
      raw: asObject(row.raw_row_json)
    };

    const eventKey =
      getField(rowData, "oph_order_payment_history_id") ||
      getField(rowData, "odp_payment_history_id") ||
      getField(rowData, "odp_order_detail_payment_id") ||
      getField(rowData, "source_payment_key") ||
      getField(rowData, "order_id");

    const paymentAmount =
      toNumber(getField(rowData, "order_payment_amount")) ??
      toNumber(getField(rowData, "oph_payment_amount")) ??
      toNumber(getField(rowData, "odp_paid_amount"));

    if (!eventKey && paymentAmount === null) {
      continue;
    }

    const key = eventKey || `row:${rowId}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        rowIds: [rowId],
        leadRowId: rowId,
        leadRowNumber: typeof row.row_number === "number" ? row.row_number : Number.parseInt(clean(row.row_number), 10) || Number.MAX_SAFE_INTEGER,
        paymentAmount,
        paidRegistrationFee: toNumber(getField(rowData, "user_paid_registration_fee", "oph_per_reg_fee", "odp_paid_reg_fee")),
        paidCcFee: toNumber(getField(rowData, "user_paid_cc_fee", "oph_cc_fee", "odp_paid_cc_fee")),
        paymentStatus: getField(rowData, "oph_payment_status", "order_payment_status") || null,
        paymentDate: toDateIso(getField(rowData, "oph_payment_date", "odp_created_date", "order_date"))
      });
      continue;
    }

    existing.rowIds.push(rowId);
    const rowNumber = typeof row.row_number === "number" ? row.row_number : Number.parseInt(clean(row.row_number), 10) || Number.MAX_SAFE_INTEGER;
    if (rowNumber < existing.leadRowNumber) {
      existing.leadRowNumber = rowNumber;
      existing.leadRowId = rowId;
    }
  }

  return groups;
}

function allocateEven(totalAmount: number | null, count: number) {
  if (count <= 0) {
    return [];
  }

  if (totalAmount === null) {
    return new Array(count).fill(null);
  }

  const totalCents = Math.round(totalAmount * 100);
  const base = Math.trunc(totalCents / count);
  const remainder = totalCents - base * count;

  return new Array(count).fill(0).map((_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}

async function writeGroupPayments(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  group: PaymentGroup;
  rowsById: Map<string, Record<string, unknown>>;
  rowStateById: Map<string, RowState>;
  runId: string;
}) {
  const registrations: Array<{ rowId: string; registrationId: string; orderId: string; playerId: string; payerUserId: string }> = [];

  for (const rowId of input.group.rowIds) {
    const state = input.rowStateById.get(rowId);
    if (!state?.registrationId || !state.orderId || !state.playerId || !state.accountUserId) {
      continue;
    }

    if (!registrations.some((value) => value.registrationId === state.registrationId)) {
      registrations.push({
        rowId,
        registrationId: state.registrationId,
        orderId: state.orderId,
        playerId: state.playerId,
        payerUserId: state.accountUserId
      });
    }
  }

  if (registrations.length === 0) {
    throw new StageError("payment", "missing_registration_for_payment", {
      source_event_id: input.group.key
    });
  }

  registrations.sort((a, b) => a.registrationId.localeCompare(b.registrationId));

  const amountAllocations = allocateEven(input.group.paymentAmount, registrations.length);
  const regFeeAllocations = allocateEven(input.group.paidRegistrationFee, registrations.length);
  const ccFeeAllocations = allocateEven(input.group.paidCcFee, registrations.length);

  const paymentIds: string[] = [];
  let createdAny = false;

  for (let index = 0; index < registrations.length; index += 1) {
    const target = registrations[index];
    const sourceRow = input.rowsById.get(target.rowId);
    const rowData = {
      normalized: sourceRow ? asObject(sourceRow.normalized_row_json) : {},
      raw: sourceRow ? asObject(sourceRow.raw_row_json) : {}
    };

    const { data: existingPayment } = await input.service
      .schema("commerce").from("payments")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("source_payment_key", input.group.key)
      .eq("registration_id", target.registrationId)
      .limit(1)
      .maybeSingle();

    const { data: payment, error } = await input.service
      .schema("commerce").from("payments")
      .upsert(
        {
          org_id: input.orgId,
          order_id: target.orderId,
          source_payment_key: input.group.key,
          payment_status: input.group.paymentStatus,
          payment_date: input.group.paymentDate,
          payment_amount: amountAllocations[index],
          paid_registration_fee: regFeeAllocations[index],
          paid_cc_fee: ccFeeAllocations[index],
          registration_id: target.registrationId,
          player_id: target.playerId,
          payer_user_id: target.payerUserId,
          source_event_id: input.group.key,
          source_event_sequence: index + 1,
          source_event_count: registrations.length,
          metadata_json: {
            import_source: "smart_import",
            run_id: input.runId,
            source_event_identity: input.group.key,
            source_event_sequence: index + 1,
            source_event_count: registrations.length,
            payment_method: getField(rowData, "order_payment_method", "oph_payment_method") || null,
            transaction_id: getField(rowData, "oph_transaction_id") || null,
            card_last4: getField(rowData, "last_4_of_cc") || null,
            credit_card_type: getField(rowData, "oph_credit_card_type") || null
          }
        },
        {
          onConflict: "org_id,source_payment_key,registration_id"
        }
      )
      .select("id")
      .single();

    if (error || !payment?.id) {
      throw new StageError("payment", "payment_upsert_failed", {
        message: error?.message ?? "upsert failed",
        source_event_id: input.group.key,
        registration_id: target.registrationId
      });
    }

    paymentIds.push(String(payment.id));
    if (!existingPayment?.id) {
      createdAny = true;
    }
  }

  return {
    paymentIds,
    createdAny
  } as const;
}

function hasSuccessfulStage(stageState: Partial<Record<StageName, string | null>>, stage: StageName) {
  return Object.prototype.hasOwnProperty.call(stageState, stage);
}

async function cancelRun(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
}) {
  const { data: run, error } = await input.service
    .schema("imports").from("import_runs")
    .select("id, status")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();

  if (error || !run) {
    throw new Error("Run not found.");
  }

  if (run.status === "completed" || run.status === "undone") {
    return {
      ok: true,
      status: run.status,
      message: "Run is already finalized."
    };
  }

  await input.service
    .schema("imports").from("import_runs")
    .update({
      status: "cancelled",
      progress: 100
    })
    .eq("id", input.runId)
    .eq("org_id", input.orgId);

  return {
    ok: true,
    status: "cancelled"
  };
}

async function safeDeleteRecord(input: {
  service: ReturnType<typeof createClient>;
  schema: string;
  table: string;
  id: string;
}) {
  if (input.schema === "auth" && input.table === "users") {
    const result = await input.service.auth.admin.deleteUser(input.id);
    if (result.error && !result.error.message.toLowerCase().includes("not found")) {
      throw new Error(result.error.message);
    }
    return;
  }

  const { error } = await input.service
    .schema(input.schema)
    .from(input.table)
    .delete()
    .eq("id", input.id);

  if (error && !error.message.toLowerCase().includes("0 rows") && !error.message.toLowerCase().includes("not found")) {
    throw new Error(error.message);
  }
}

async function undoOrphanAccountsForRun(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
}) {
  const { data: rows, error } = await input.service
    .schema("imports").from("import_rows")
    .select("normalized_row_json, raw_row_json")
    .eq("org_id", input.orgId)
    .eq("run_id", input.runId);

  if (error) {
    logRuntime("undo_orphan_scan_failed", {
      org_id: input.orgId,
      run_id: input.runId,
      message: error.message
    });
    return 0;
  }

  const emails = new Set<string>();
  for (const row of rows ?? []) {
    const rowData = {
      normalized: asObject(row.normalized_row_json),
      raw: asObject(row.raw_row_json)
    };
    const email = toEmail(getField(rowData, "user_email", "email", "guardian_email", "contact_email"));
    if (email) {
      emails.add(email);
    }
  }

  let deleted = 0;
  for (const email of emails) {
    const lookup = await findAuthUserRecordByEmail(email);
    if ("error" in lookup) {
      logRuntime("undo_orphan_lookup_failed", {
        org_id: input.orgId,
        run_id: input.runId,
        email,
        message: lookup.error
      });
      continue;
    }

    const user = lookup.user;
    if (!user) {
      continue;
    }

    const userId = clean(user.id);
    if (!userId) {
      continue;
    }

    const userMeta = asObject(user.user_metadata);
    const createdByImport = userMeta.import_source === "smart_import";
    const createdForOrg = clean(userMeta.import_org_id) === input.orgId;
    const createdForRun = clean(userMeta.import_run_id) === input.runId;
    if (!createdByImport || !createdForOrg || !createdForRun) {
      continue;
    }

    await input.service
      .schema("people").from("users")
      .delete()
      .eq("user_id", userId);

    await input.service
      .schema("orgs").from("memberships")
      .delete()
      .eq("org_id", input.orgId)
      .eq("user_id", userId);

    try {
      await safeDeleteRecord({
        service: input.service,
        schema: "auth",
        table: "users",
        id: userId
      });
      deleted += 1;
      logRuntime("undo_orphan_account_deleted", {
        org_id: input.orgId,
        run_id: input.runId,
        user_id: userId,
        email
      });
    } catch (deleteError) {
      logRuntime("undo_orphan_delete_failed", {
        org_id: input.orgId,
        run_id: input.runId,
        user_id: userId,
        email,
        message: deleteError instanceof Error ? deleteError.message : "Unknown delete error"
      });
    }
  }

  return deleted;
}

async function undoRun(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  runId: string;
  userId: string;
}) {
  const { data: run, error } = await input.service
    .schema("imports").from("import_runs")
    .select("id, status, summary_json")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();

  if (error || !run) {
    throw new Error("Run not found.");
  }

  const originalStatus = clean(run.status);
  if (originalStatus === "undoing") {
    throw new Error("Run undo is already in progress.");
  }

  await input.service
    .schema("imports").from("import_runs")
    .update({
      status: "undoing"
    })
    .eq("id", input.runId)
    .eq("org_id", input.orgId);

  const { data: logs, error: logsError } = await input.service
    .schema("imports").from("import_apply_log")
    .select("id, target_schema, target_table, target_record_id, apply_action, status, undo_payload_json")
    .eq("org_id", input.orgId)
    .eq("run_id", input.runId)
    .eq("status", "applied")
    .is("undone_at", null)
    .order("created_at", { ascending: false });

  if (logsError) {
    throw new Error(`Failed to load apply log: ${logsError.message}`);
  }

  let undone = 0;
  let reversibleLogCount = 0;
  let undoFailedCount = 0;

  for (const log of logs ?? []) {
    const schema = clean(log.target_schema);
    const table = clean(log.target_table);
    const recordId = clean(log.target_record_id);
    const action = clean(log.apply_action);
    const undoPayload = asObject(log.undo_payload_json);
    const extraDeletes = Array.isArray(undoPayload.delete_ids) ? undoPayload.delete_ids : [];
    const isReversible = (action === "insert" && schema && table && recordId) || extraDeletes.length > 0;
    if (!isReversible) {
      continue;
    }

    reversibleLogCount += 1;

    try {
      if (action === "insert" && schema && table && recordId) {
        await safeDeleteRecord({
          service: input.service,
          schema,
          table,
          id: recordId
        });
      }

      for (const entry of extraDeletes) {
        const value = asObject(entry);
        const deleteSchema = clean(value.schema);
        const deleteTable = clean(value.table);
        const deleteId = clean(value.id);
        if (!deleteSchema || !deleteTable || !deleteId) {
          continue;
        }

        await safeDeleteRecord({
          service: input.service,
          schema: deleteSchema,
          table: deleteTable,
          id: deleteId
        });
      }

      await input.service
        .schema("imports").from("import_apply_log")
        .update({
          undone_at: new Date().toISOString(),
          undone_by_user_id: input.userId
        })
        .eq("id", log.id);

      undone += 1;
    } catch (error) {
      undoFailedCount += 1;
      logRuntime("undo_delete_failed", {
        run_id: input.runId,
        org_id: input.orgId,
        apply_log_id: clean(log.id),
        target_schema: schema,
        target_table: table,
        target_record_id: recordId,
        message: error instanceof Error ? error.message : "Unknown undo delete failure"
      });
      // Continue undoing remaining rows even when one record is already gone.
    }
  }

  if (undone === 0) {
    const orphanUndone = await undoOrphanAccountsForRun({
      service: input.service,
      orgId: input.orgId,
      runId: input.runId
    });
    undone += orphanUndone;
  }

  if (reversibleLogCount === 0 && undone === 0) {
    await input.service
      .schema("imports").from("import_runs")
      .update({
        status: originalStatus || "completed",
        progress: 100,
        error_text: "Undo not applied: no reversible inserted records were found for this run."
      })
      .eq("id", input.runId)
      .eq("org_id", input.orgId);

    throw new Error("Undo not applied: no reversible inserted records were found for this run.");
  }

  if (reversibleLogCount > 0 && undone < reversibleLogCount) {
    await input.service
      .schema("imports").from("import_runs")
      .update({
        status: originalStatus || "completed",
        progress: 100,
        error_text: `Undo incomplete: reversed ${undone} of ${reversibleLogCount} reversible records.`
      })
      .eq("id", input.runId)
      .eq("org_id", input.orgId);

    throw new Error(
      `Undo incomplete: reversed ${undone} of ${reversibleLogCount} reversible records (${undoFailedCount} failed deletes).`
    );
  }

  const summary = asObject(run.summary_json);
  await input.service
    .schema("imports").from("import_runs")
    .update({
      status: "undone",
      progress: 100,
      undone_at: new Date().toISOString(),
      summary_json: {
        ...summary,
        undone_rows: (Number(summary.undone_rows ?? 0) || 0) + undone
      }
    })
    .eq("id", input.runId)
    .eq("org_id", input.orgId);

  return {
    ok: true,
    status: "undone",
    undone_rows: undone
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const rawPayload = (await request.json()) as Record<string, unknown>;
    const action = clean(rawPayload.action) as RequestPayload["action"];
    const orgId = clean(rawPayload.org_id ?? rawPayload.orgId);
    const runId = clean(rawPayload.run_id ?? rawPayload.runId);
    const batchSizeInput = rawPayload.batch_size ?? rawPayload.batchSize;
    const batchSize = typeof batchSizeInput === "number" ? batchSizeInput : Number.parseInt(String(batchSizeInput ?? ""), 10);

    if (!action || !orgId || !runId) {
      return json(
        {
          error: "Invalid payload.",
          details: {
            missing_action: !action,
            missing_org_id: !orgId,
            missing_run_id: !runId
          }
        },
        400
      );
    }

    const auth = await requireAuthorizedClient(request, orgId);
    if ("error" in auth) {
      return auth.error;
    }

    if (action === "cancel_run") {
      const result = await cancelRun({
        service: auth.service,
        orgId,
        runId
      });
      return json(result);
    }

    if (action === "undo_run") {
      const result = await undoRun({
        service: auth.service,
        orgId,
        runId,
        userId: auth.user.id
      });
      return json(result);
    }

    const safeBatchSize = Math.max(1, Math.min(500, Number.isFinite(batchSize) ? batchSize : 50));
    const applyStartMs = Date.now();
    const APPLY_TIME_BUDGET_MS = 25000;
    const { data: run, error: runError } = await auth.service
      .schema("imports").from("import_runs")
      .select("id, org_id, created_by_user_id, profile_key, row_count, summary_json, pass_progress_json, status")
      .eq("id", runId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (runError || !run) {
      return json({ error: "Run not found." }, 404);
    }

    if (run.status === "cancelled") {
      return json({ ok: true, status: "cancelled", message: "Run is cancelled." });
    }

    if (run.status === "undone") {
      return json({ ok: true, status: "undone", message: "Run has already been undone." });
    }

    await auth.service
      .schema("imports").from("import_runs")
      .update({
        status: "applying"
      })
      .eq("id", run.id);

    const { data: rows, error: rowsError } = await auth.service
      .schema("imports").from("import_rows")
      .select("id, run_id, org_id, profile_key, row_number, raw_row_json, normalized_row_json, match_status, blocked_by_dependency")
      .eq("run_id", run.id)
      .eq("org_id", orgId)
      .in("match_status", ["direct", "resolved"])
      .order("row_number", { ascending: true })
      .limit(safeBatchSize);

    if (rowsError) {
      return json({ error: `Failed to fetch rows: ${rowsError.message}` }, 500);
    }

    const selectedRows = (rows ?? []).map((value) => asObject(value));
    const rowIds = selectedRows.map((value) => clean(value.id)).filter(Boolean);
    const rowsById = new Map<string, Record<string, unknown>>(selectedRows.map((value) => [clean(value.id), value]));

    const existingStageState = await getExistingStageState({
      service: auth.service,
      orgId: orgId,
      runId: clean(run.id),
      rowIds
    });

    const rowStateById = new Map<string, RowState>();
    for (const rowId of rowIds) {
      rowStateById.set(rowId, {
        accountUserId: null,
        playerId: null,
        programId: null,
        divisionNodeId: null,
        teamNodeId: null,
        registrationId: null,
        orderId: null
      });
    }

    const blockedRows = new Set<string>();

    let appliedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const dependencyFailures: Record<string, number> = {
      account: 0,
      player: 0,
      registration: 0,
      payment: 0
    };

    const passProgress: Record<PassName, { attempted: number; applied: number; failed: number; skipped: number }> = {
      people: { attempted: 0, applied: 0, failed: 0, skipped: 0 },
      programs: { attempted: 0, applied: 0, failed: 0, skipped: 0 },
      commerce: { attempted: 0, applied: 0, failed: 0, skipped: 0 }
    };

    const paymentGroups = buildPaymentGroups(selectedRows);
    const accountCache = new Map<string, string>();

    const passes: Array<{ name: PassName; stages: StageName[] }> = [
      { name: "people", stages: ["account", "player", "guardian_link"] },
      { name: "programs", stages: ["program_structure", "registration"] },
      { name: "commerce", stages: ["order", "payment"] }
    ];

    let budgetExceeded = false;
    passLoop: for (const pass of passes) {
      for (const row of selectedRows) {
        if (Date.now() - applyStartMs >= APPLY_TIME_BUDGET_MS) {
          budgetExceeded = true;
          break passLoop;
        }
        const rowId = clean(row.id);
        if (!rowId) {
          continue;
        }

        passProgress[pass.name].attempted += 1;

        if (blockedRows.has(rowId) || row.blocked_by_dependency === true) {
          passProgress[pass.name].skipped += 1;
          continue;
        }

        const rowData = {
          normalized: asObject(row.normalized_row_json),
          raw: asObject(row.raw_row_json)
        };

        const rowState = rowStateById.get(rowId) ?? {
          accountUserId: null,
          playerId: null,
          programId: null,
          divisionNodeId: null,
          teamNodeId: null,
          registrationId: null,
          orderId: null
        };

        const stageState = existingStageState.get(rowId) ?? {};

        try {
          for (const stage of pass.stages) {
            if (hasSuccessfulStage(stageState, stage)) {
              const target = stageState[stage] ?? null;
              if (stage === "account") rowState.accountUserId = target;
              if (stage === "player") rowState.playerId = target;
              if (stage === "program_structure") rowState.programId = target;
              if (stage === "registration") rowState.registrationId = target;
              if (stage === "order") rowState.orderId = target;
              continue;
            }

            if (stage === "account") {
              const account = await resolveOrCreateAccount({ service: auth.service, orgId, runId: clean(run.id), accountCache, rowData });
              rowState.accountUserId = account.userId;
              await logStage({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                rowId,
                profileKey: clean(row.profile_key),
                stage,
                status: "applied",
                targetSchema: "auth",
                targetTable: "users",
                targetRecordId: account.userId,
                applyAction: account.created ? "insert" : "update"
              });
              continue;
            }

            if (stage === "player") {
              if (!rowState.accountUserId) {
                throw new StageError("player", "missing_account_dependency");
              }

              const player = await resolveOrCreatePlayer({
                service: auth.service,
                accountUserId: rowState.accountUserId,
                orgId: orgId,
                rowData
              });

              rowState.playerId = player.playerId;
              await logStage({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                rowId,
                profileKey: clean(row.profile_key),
                stage,
                status: "applied",
                targetSchema: "people",
                targetTable: "players",
                targetRecordId: player.playerId,
                applyAction: player.created ? "insert" : "update"
              });
              continue;
            }

            if (stage === "guardian_link") {
              if (!rowState.accountUserId || !rowState.playerId) {
                throw new StageError("guardian_link", "missing_player_or_account_dependency");
              }

              await ensureGuardianLink({
                service: auth.service,
                guardianUserId: rowState.accountUserId,
                playerId: rowState.playerId
              });

              await logStage({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                rowId,
                profileKey: clean(row.profile_key),
                stage,
                status: "applied",
                targetSchema: "people",
                targetTable: "player_guardians",
                targetRecordId: `${rowState.playerId}:${rowState.accountUserId}`,
                applyAction: "insert"
              });
              continue;
            }

            if (stage === "program_structure") {
              const structure = await resolveOrCreateProgramStructure({
                service: auth.service,
                orgId: orgId,
                rowData
              });

              rowState.programId = structure.programId;
              rowState.divisionNodeId = structure.divisionNodeId;
              rowState.teamNodeId = structure.teamNodeId;

              await logStage({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                rowId,
                profileKey: clean(row.profile_key),
                stage,
                status: "applied",
                targetSchema: "programs",
                targetTable: "programs",
                targetRecordId: structure.programId,
                applyAction: structure.programCreated ? "insert" : "update",
                undoPayload:
                  structure.divisionCreatedId || structure.teamCreatedId
                    ? {
                        delete_ids: [
                          structure.teamCreatedId
                            ? { schema: "programs", table: "program_structure_nodes", id: structure.teamCreatedId }
                            : null,
                          structure.divisionCreatedId
                            ? { schema: "programs", table: "program_structure_nodes", id: structure.divisionCreatedId }
                            : null
                        ].filter(Boolean)
                      }
                    : null
              });
              continue;
            }

            if (stage === "registration") {
              if (!rowState.playerId || !rowState.accountUserId || !rowState.programId) {
                throw new StageError("registration", "missing_dependency", {
                  has_player: Boolean(rowState.playerId),
                  has_account: Boolean(rowState.accountUserId),
                  has_program: Boolean(rowState.programId)
                });
              }

              const registration = await resolveOrCreateRegistration({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                createdByUserId: clean(run.created_by_user_id),
                submittedByUserId: rowState.accountUserId,
                playerId: rowState.playerId,
                programId: rowState.programId,
                programNodeId: rowState.teamNodeId ?? rowState.divisionNodeId,
                rowData
              });

              rowState.registrationId = registration.registrationId;

              await logStage({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                rowId,
                profileKey: clean(row.profile_key),
                stage,
                status: "applied",
                targetSchema: "programs",
                targetTable: "program_registrations",
                targetRecordId: registration.registrationId,
                applyAction: registration.created ? "insert" : "update",
                undoPayload:
                  registration.createdSubmissionId || registration.createdVersionId || registration.createdFormId
                    ? {
                        delete_ids: [
                          registration.createdSubmissionId
                            ? { schema: "forms", table: "org_form_submissions", id: registration.createdSubmissionId }
                            : null,
                          registration.createdVersionId
                            ? { schema: "forms", table: "org_form_versions", id: registration.createdVersionId }
                            : null,
                          registration.createdFormId
                            ? { schema: "forms", table: "org_forms", id: registration.createdFormId }
                            : null
                        ].filter(Boolean)
                      }
                    : null
              });
              continue;
            }

            if (stage === "order") {
              if (!rowState.accountUserId || !rowState.playerId || !rowState.registrationId) {
                throw new StageError("order", "missing_registration_dependency");
              }

              const order = await resolveOrCreateOrder({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                payerUserId: rowState.accountUserId,
                playerId: rowState.playerId,
                registrationId: rowState.registrationId,
                rowData
              });

              rowState.orderId = order.orderId;

              await logStage({
                service: auth.service,
                orgId: orgId,
                runId: clean(run.id),
                rowId,
                profileKey: clean(row.profile_key),
                stage,
                status: "applied",
                targetSchema: "commerce",
                targetTable: "orders",
                targetRecordId: order.orderId,
                applyAction: order.created ? "insert" : "update"
              });
              continue;
            }

            if (stage === "payment") {
              const paymentGroup = Array.from(paymentGroups.values()).find((group) => group.rowIds.includes(rowId));
              if (!paymentGroup) {
                await logStage({
                  service: auth.service,
                  orgId: orgId,
                  runId: clean(run.id),
                  rowId,
                  profileKey: clean(row.profile_key),
                  stage,
                  status: "skipped",
                  targetSchema: "commerce",
                  targetTable: "payments",
                  applyAction: "skip",
                  message: "Row had no payment event fields."
                });
                continue;
              }

              if (paymentGroup.leadRowId !== rowId) {
                await logStage({
                  service: auth.service,
                  orgId: orgId,
                  runId: clean(run.id),
                  rowId,
                  profileKey: clean(row.profile_key),
                  stage,
                  status: "applied",
                  targetSchema: "commerce",
                  targetTable: "payments",
                  targetRecordId: paymentGroup.key,
                  applyAction: "insert",
                  message: "Payment group handled by lead row."
                });
                continue;
              }

              const paymentResult = await writeGroupPayments({
                service: auth.service,
                orgId: orgId,
                group: paymentGroup,
                rowsById,
                rowStateById,
                runId: clean(run.id)
              });

              for (const groupRowId of paymentGroup.rowIds) {
                await logStage({
                  service: auth.service,
                  orgId: orgId,
                  runId: clean(run.id),
                  rowId: groupRowId,
                  profileKey: clean(rowsById.get(groupRowId)?.profile_key),
                  stage,
                  status: "applied",
                  targetSchema: "commerce",
                  targetTable: "payments",
                  targetRecordId: paymentResult.paymentIds[0] ?? paymentGroup.key,
                  applyAction: paymentResult.createdAny ? "insert" : "update",
                  undoPayload: {
                    delete_ids: paymentResult.paymentIds.map((id) => ({
                      schema: "commerce",
                      table: "payments",
                      id
                    }))
                  }
                });

                await auth.service
                  .schema("imports").from("import_rows")
                  .update({
                    match_status: "applied",
                    blocked_by_dependency: false,
                    dependency_stage: null,
                    dependency_reason: null
                  })
                  .eq("id", groupRowId)
                  .in("match_status", ["direct", "resolved"]);
              }

              continue;
            }
          }

          rowStateById.set(rowId, rowState);
          passProgress[pass.name].applied += 1;
        } catch (error) {
          failedCount += 1;
          passProgress[pass.name].failed += 1;
          blockedRows.add(rowId);

          const stageError = error instanceof StageError ? error : new StageError(pass.stages.at(-1) ?? "payment", "unhandled_stage_error", {
            message: error instanceof Error ? error.message : "Unknown stage failure"
          });
          logRuntime("apply_stage_failed", {
            run_id: clean(run.id),
            org_id: orgId,
            row_id: rowId,
            stage: stageError.stage,
            reason: stageError.reason,
            details: stageError.details
          });

          if (stageError.stage === "account") dependencyFailures.account += 1;
          if (stageError.stage === "player") dependencyFailures.player += 1;
          if (stageError.stage === "registration") dependencyFailures.registration += 1;
          if (stageError.stage === "payment") dependencyFailures.payment += 1;

          await logStage({
            service: auth.service,
            orgId: orgId,
            runId: clean(run.id),
            rowId,
            profileKey: clean(row.profile_key),
            stage: stageError.stage,
            status: "failed",
            applyAction: "skip",
            message: stageError.reason
          });

          await upsertDependencyConflict({
            service: auth.service,
            orgId: orgId,
            runId: clean(run.id),
            row,
            stage: stageError.stage,
            reason: stageError.reason,
            details: stageError.details
          });
        }
      }

      if (pass.name === "people") {
        await auth.service
          .schema("imports").from("import_runs")
          .update({
            progress: 33,
            pass_progress_json: {
              ...asObject(run.pass_progress_json),
              people: passProgress.people
            }
          })
          .eq("id", run.id);
      }

      if (pass.name === "programs") {
        await auth.service
          .schema("imports").from("import_runs")
          .update({
            progress: 66,
            pass_progress_json: {
              ...asObject(run.pass_progress_json),
              people: passProgress.people,
              programs: passProgress.programs
            }
          })
          .eq("id", run.id);
      }
    }

    if (budgetExceeded) {
      logRuntime("apply_time_budget_yield", {
        run_id: clean(run.id),
        org_id: orgId,
        elapsed_ms: Date.now() - applyStartMs,
        safe_batch_size: safeBatchSize
      });
    }

    for (const row of selectedRows) {
      const rowId = clean(row.id);
      if (!rowId || blockedRows.has(rowId)) {
        skippedCount += 1;
        continue;
      }

      appliedCount += 1;
    }

    const { count: remainingRows } = await auth.service
      .schema("imports").from("import_rows")
      .select("id", { head: true, count: "exact" })
      .eq("run_id", run.id)
      .eq("org_id", orgId)
      .in("match_status", ["direct", "resolved"]);

    const { count: unresolvedConflicts } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id", { head: true, count: "exact" })
      .eq("run_id", run.id)
      .eq("org_id", orgId)
      .in("resolution_state", ["pending_ai", "needs_review"]);

    const totalRemaining = (remainingRows ?? 0) + (unresolvedConflicts ?? 0);
    const nextStatus = totalRemaining > 0 ? (unresolvedConflicts ?? 0) > 0 ? "awaiting_conflicts" : "ready_to_apply" : "completed";

    const summary = asObject(run.summary_json);
    await auth.service
      .schema("imports").from("import_runs")
      .update({
        status: nextStatus,
        progress: nextStatus === "completed" ? 100 : 90,
        completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
        summary_json: {
          ...summary,
          applied_rows: (Number(summary.applied_rows ?? 0) || 0) + appliedCount,
          skipped_rows: (Number(summary.skipped_rows ?? 0) || 0) + skippedCount,
          failed_rows: (Number(summary.failed_rows ?? 0) || 0) + failedCount,
          dependency_failures: dependencyFailures,
          pass_progress: passProgress
        },
        pass_progress_json: passProgress
      })
      .eq("id", run.id);

    return json({
      ok: true,
      applied_rows: appliedCount,
      skipped_rows: skippedCount,
      failed_rows: failedCount,
      status: nextStatus,
      pass_progress: passProgress,
      dependency_failures: dependencyFailures
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unhandled writer error."
      },
      500
    );
  }
});
