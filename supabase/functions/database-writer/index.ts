import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

type RequestPayload = {
  action: "apply_batch";
  org_id: string;
  run_id: string;
  batch_size?: number;
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function requireAuthorizedClient(request: Request, orgId: string) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: json({ error: "Missing Authorization header." }, 401) } as const;
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

async function writePeopleRow(input: {
  service: ReturnType<typeof createClient>;
  run: Record<string, unknown>;
  row: Record<string, unknown>;
  decision: Record<string, unknown> | null;
}) {
  const normalized = asObject(input.row.normalized_row_json);
  const firstName = clean(normalized.first_name) || "Imported";
  const lastName = clean(normalized.last_name) || "Player";
  const preferredName = clean(normalized.preferred_name) || null;
  const dateOfBirth = clean(normalized.date_of_birth) || null;
  const targetId = input.decision && typeof input.decision.target_id === "string" ? input.decision.target_id : null;

  if (targetId) {
    const { data, error } = await input.service
      .schema("people").from("players")
      .update({
        first_name: firstName,
        last_name: lastName,
        preferred_name: preferredName,
        date_of_birth: dateOfBirth,
        metadata_json: {
          import_source: "smart_import",
          run_id: input.run.id
        }
      })
      .eq("id", targetId)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to update player: ${error?.message ?? "unknown error"}`);
    }

    return { action: "update", schema: "people", table: "players", id: String(data.id) } as const;
  }

  const ownerUserId = clean(input.run.created_by_user_id);
  const { data, error } = await input.service
    .schema("people").from("players")
    .insert({
      owner_user_id: ownerUserId,
      first_name: firstName,
      last_name: lastName,
      preferred_name: preferredName,
      date_of_birth: dateOfBirth,
      metadata_json: {
        import_source: "smart_import",
        run_id: input.run.id
      }
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert player: ${error?.message ?? "unknown error"}`);
  }

  return { action: "insert", schema: "people", table: "players", id: String(data.id) } as const;
}

async function writeProgramRow(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  run: Record<string, unknown>;
  row: Record<string, unknown>;
  decision: Record<string, unknown> | null;
}) {
  const normalized = asObject(input.row.normalized_row_json);
  const name = clean(normalized.program_name) || clean(normalized.team_name) || clean(normalized.division_name) || "Imported Program";
  const targetId = input.decision && typeof input.decision.target_id === "string" ? input.decision.target_id : null;

  if (targetId) {
    const { data, error } = await input.service
      .schema("programs").from("programs")
      .update({
        name
      })
      .eq("org_id", input.orgId)
      .eq("id", targetId)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to update program: ${error?.message ?? "unknown error"}`);
    }

    return { action: "update", schema: "programs", table: "programs", id: String(data.id) } as const;
  }

  const slug = slugify(`${name}-${String(input.run.id).slice(0, 8)}`);
  const { data, error } = await input.service
    .schema("programs").from("programs")
    .insert({
      org_id: input.orgId,
      slug: slug || `import-${String(input.run.id).slice(0, 8)}`,
      name,
      status: "draft",
      program_type: "custom",
      settings_json: {
        import_source: "smart_import",
        run_id: input.run.id
      }
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert program: ${error?.message ?? "unknown error"}`);
  }

  return { action: "insert", schema: "programs", table: "programs", id: String(data.id) } as const;
}

async function writeCommerceRow(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  run: Record<string, unknown>;
  row: Record<string, unknown>;
  decision: Record<string, unknown> | null;
}) {
  const normalized = asObject(input.row.normalized_row_json);
  const sourceOrderId = clean(normalized.source_order_id) || `import-${String(input.row.id).slice(0, 8)}`;
  const sourceOrderNo = clean(normalized.source_order_no) || null;
  const orderStatus = clean(normalized.order_status) || "imported";
  const orderDate = clean(normalized.order_date) || null;
  const targetId = input.decision && typeof input.decision.target_id === "string" ? input.decision.target_id : null;

  if (targetId) {
    const { data, error } = await input.service
      .schema("commerce").from("orders")
      .update({
        source_order_no: sourceOrderNo,
        order_status: orderStatus,
        order_date: orderDate
      })
      .eq("org_id", input.orgId)
      .eq("id", targetId)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to update order: ${error?.message ?? "unknown error"}`);
    }

    return { action: "update", schema: "commerce", table: "orders", id: String(data.id) } as const;
  }

  const { data, error } = await input.service
    .schema("commerce").from("orders")
    .upsert(
      {
        org_id: input.orgId,
        source_order_id: sourceOrderId,
        source_order_no: sourceOrderNo,
        source_system: "smart_import",
        order_status: orderStatus,
        order_date: orderDate,
        metadata_json: {
          import_source: "smart_import",
          run_id: input.run.id
        }
      },
      {
        onConflict: "org_id,source_order_id"
      }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert order: ${error?.message ?? "unknown error"}`);
  }

  return { action: "insert", schema: "commerce", table: "orders", id: String(data.id) } as const;
}

async function applySingle(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  run: Record<string, unknown>;
  row: Record<string, unknown>;
  decision: Record<string, unknown> | null;
}) {
  const profileKey = clean(input.row.profile_key);
  const action = input.decision && typeof input.decision.action === "string" ? input.decision.action : "insert";
  if (action === "skip") {
    return { action: "skip", schema: "", table: "", id: null as string | null } as const;
  }

  if (profileKey === "people_roster") {
    return writePeopleRow(input);
  }

  if (profileKey === "program_structure") {
    return writeProgramRow(input);
  }

  return writeCommerceRow(input);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = (await request.json()) as RequestPayload;
    if (payload.action !== "apply_batch" || !payload.org_id || !payload.run_id) {
      return json({ error: "Invalid payload." }, 400);
    }

    const auth = await requireAuthorizedClient(request, payload.org_id);
    if ("error" in auth) {
      return auth.error;
    }

    const batchSize = Math.max(1, Math.min(500, payload.batch_size ?? 200));
    const { data: run, error: runError } = await auth.service
      .schema("imports").from("import_runs")
      .select("id, org_id, created_by_user_id, profile_key, row_count, summary_json")
      .eq("id", payload.run_id)
      .eq("org_id", payload.org_id)
      .maybeSingle();

    if (runError || !run) {
      return json({ error: "Run not found." }, 404);
    }

    await auth.service
      .schema("imports").from("import_runs")
      .update({
        status: "applying"
      })
      .eq("id", run.id);

    const { data: directRows, error: directError } = await auth.service
      .schema("imports").from("import_rows")
      .select("id, run_id, org_id, profile_key, normalized_row_json, match_status")
      .eq("run_id", run.id)
      .eq("org_id", payload.org_id)
      .in("match_status", ["direct", "resolved"])
      .order("row_number", { ascending: true })
      .limit(batchSize);

    if (directError) {
      return json({ error: `Failed to fetch rows: ${directError.message}` }, 500);
    }

    const { data: resolvedConflicts } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id, row_id, resolution_json, resolution_state")
      .eq("run_id", run.id)
      .eq("org_id", payload.org_id)
      .in("resolution_state", ["auto_applied", "manual_resolved"])
      .limit(batchSize);

    const decisionByRowId = new Map<string, Record<string, unknown>>();
    for (const conflict of resolvedConflicts ?? []) {
      if (typeof conflict.row_id === "string") {
        decisionByRowId.set(conflict.row_id, asObject(conflict.resolution_json));
      }
    }

    let appliedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const row of directRows ?? []) {
      const idempotencyKey = `${run.id}:${row.id}`;
      const { data: existingLog } = await auth.service
        .schema("imports").from("import_apply_log")
        .select("id")
        .eq("org_id", payload.org_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingLog?.id) {
        continue;
      }

      try {
        const decision = decisionByRowId.get(String(row.id)) ?? null;
        const applied = await applySingle({
          service: auth.service,
          orgId: payload.org_id,
          run: asObject(run),
          row: asObject(row),
          decision
        });

        const status = applied.action === "skip" ? "skipped" : "applied";
        if (status === "applied") {
          appliedCount += 1;
        } else {
          skippedCount += 1;
        }

        await auth.service
          .schema("imports").from("import_apply_log")
          .insert({
            org_id: payload.org_id,
            run_id: run.id,
            row_id: row.id,
            profile_key: row.profile_key,
            idempotency_key: idempotencyKey,
            target_schema: applied.schema || null,
            target_table: applied.table || null,
            target_record_id: applied.id,
            apply_action: applied.action,
            status
          });

        await auth.service
          .schema("imports").from("import_rows")
          .update({
            match_status: "applied"
          })
          .eq("id", row.id);
      } catch (error) {
        failedCount += 1;
        await auth.service
          .schema("imports").from("import_apply_log")
          .insert({
            org_id: payload.org_id,
            run_id: run.id,
            row_id: row.id,
            profile_key: row.profile_key,
            idempotency_key: idempotencyKey,
            apply_action: "skip",
            status: "failed",
            message: error instanceof Error ? error.message : "Failed to apply row."
          });
      }
    }

    const { count: remainingRows } = await auth.service
      .schema("imports").from("import_rows")
      .select("id", { head: true, count: "exact" })
      .eq("run_id", run.id)
      .eq("org_id", payload.org_id)
      .in("match_status", ["direct", "resolved"]);

    const { count: unresolvedConflicts } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id", { head: true, count: "exact" })
      .eq("run_id", run.id)
      .eq("org_id", payload.org_id)
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
          failed_rows: (Number(summary.failed_rows ?? 0) || 0) + failedCount
        }
      })
      .eq("id", run.id);

    return json({
      ok: true,
      applied_rows: appliedCount,
      skipped_rows: skippedCount,
      failed_rows: failedCount,
      status: nextStatus
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
