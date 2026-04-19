import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_GATEWAY_API_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? "";
const AI_GATEWAY_BASE_URL = Deno.env.get("AI_GATEWAY_BASE_URL") ?? "https://ai-gateway.vercel.sh/v1";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "google/gemini-2.0-flash-001";
const AUTO_APPLY_THRESHOLD = 0.85;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

type RequestPayload = {
  action: "resolve_batch";
  org_id: string;
  run_id: string;
  batch_size?: number;
};

type Resolution = {
  action: "insert" | "update" | "skip";
  target_id: string | null;
  confidence: number;
  rationale: string;
  user_prompt: string;
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

function asResolution(value: unknown): Resolution | null {
  const parsed = asObject(value);
  const action = parsed.action;
  const confidence = parsed.confidence;
  const rationale = parsed.rationale;
  const userPrompt = parsed.user_prompt;

  if ((action !== "insert" && action !== "update" && action !== "skip") || typeof confidence !== "number") {
    return null;
  }

  return {
    action,
    target_id: typeof parsed.target_id === "string" ? parsed.target_id : null,
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale: typeof rationale === "string" ? rationale : "No rationale provided.",
    user_prompt: typeof userPrompt === "string" ? userPrompt : "Review this conflict manually."
  };
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

async function resolveWithAi(conflict: {
  imported_payload_json: unknown;
  candidate_records_json: unknown;
}): Promise<Resolution | null> {
  const imported = asObject(conflict.imported_payload_json);
  const candidates = Array.isArray(conflict.candidate_records_json) ? conflict.candidate_records_json : [];

  if (!AI_GATEWAY_API_KEY) {
    const topCandidate = candidates.length > 0 ? asObject(candidates[0]) : null;
    return {
      action: topCandidate ? "update" : "insert",
      target_id: topCandidate && typeof topCandidate.id === "string" ? topCandidate.id : null,
      confidence: topCandidate ? 0.84 : 0.72,
      rationale: "Fallback heuristic was used because AI gateway credentials are not configured.",
      user_prompt: topCandidate
        ? "A likely match was found but confidence is below auto-apply threshold."
        : "No likely match was found. Review this conflict manually."
    };
  }

  const response = await fetch(`${AI_GATEWAY_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_GATEWAY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You resolve import conflicts. Return JSON only. Choose action insert/update/skip. Confidence must be 0 to 1."
        },
        {
          role: "user",
          content: JSON.stringify({
            imported,
            candidates
          })
        }
      ],
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "import_resolution",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: {
                type: "string",
                enum: ["insert", "update", "skip"]
              },
              target_id: {
                type: ["string", "null"]
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              rationale: {
                type: "string"
              },
              user_prompt: {
                type: "string"
              }
            },
            required: ["action", "target_id", "confidence", "rationale", "user_prompt"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first ? asObject(first.message) : {};
  const content = typeof message.content === "string" ? message.content : "";

  if (!content) {
    return null;
  }

  try {
    return asResolution(JSON.parse(content));
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = (await request.json()) as RequestPayload;
    if (payload.action !== "resolve_batch" || !payload.org_id || !payload.run_id) {
      return json({ error: "Invalid payload." }, 400);
    }

    const auth = await requireAuthorizedClient(request, payload.org_id);
    if ("error" in auth) {
      return auth.error;
    }

    const { data: run } = await auth.service
      .schema("imports").from("import_runs")
      .select("id, status")
      .eq("id", payload.run_id)
      .eq("org_id", payload.org_id)
      .maybeSingle();

    if (run?.status === "cancelled" || run?.status === "undone") {
      return json({
        ok: true,
        status: run.status
      });
    }

    const batchSize = Math.max(1, Math.min(500, payload.batch_size ?? 100));
    const { data: conflicts, error: conflictError } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id, row_id, imported_payload_json, candidate_records_json")
      .eq("org_id", payload.org_id)
      .eq("run_id", payload.run_id)
      .eq("resolution_state", "pending_ai")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (conflictError) {
      return json({ error: `Failed to fetch conflicts: ${conflictError.message}` }, 500);
    }

    let autoApplied = 0;
    let needsReview = 0;

    for (const conflict of conflicts ?? []) {
      const resolution = (await resolveWithAi(conflict)) ?? {
        action: "skip",
        target_id: null,
        confidence: 0.1,
        rationale: "AI output was invalid.",
        user_prompt: "AI could not determine a confident match."
      };

      const shouldAutoApply = resolution.confidence >= AUTO_APPLY_THRESHOLD;
      const resolutionState = shouldAutoApply ? "auto_applied" : "needs_review";

      if (shouldAutoApply) {
        autoApplied += 1;
      } else {
        needsReview += 1;
      }

      await auth.service
        .schema("imports").from("import_conflicts")
        .update({
          ai_suggestion_json: resolution,
          ai_confidence: resolution.confidence,
          ai_prompt: resolution.user_prompt,
          resolution_state: resolutionState,
          resolution_json: shouldAutoApply
            ? {
                action: resolution.action,
                target_id: resolution.target_id,
                rationale: resolution.rationale
              }
            : null,
          resolved_by_user_id: shouldAutoApply ? auth.user.id : null,
          resolved_at: shouldAutoApply ? new Date().toISOString() : null
        })
        .eq("id", conflict.id);

      await auth.service
        .schema("imports").from("import_decisions")
        .insert({
          org_id: payload.org_id,
          run_id: payload.run_id,
          row_id: conflict.row_id,
          conflict_id: conflict.id,
          decision_source: "auto",
          decision_action: resolution.action,
          confidence: resolution.confidence,
          rationale: resolution.rationale,
          decision_payload_json: resolution,
          created_by_user_id: auth.user.id
        });
    }

    const { count: pendingCount } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id", { head: true, count: "exact" })
      .eq("org_id", payload.org_id)
      .eq("run_id", payload.run_id)
      .eq("resolution_state", "pending_ai");

    const { count: reviewCount } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id", { head: true, count: "exact" })
      .eq("org_id", payload.org_id)
      .eq("run_id", payload.run_id)
      .eq("resolution_state", "needs_review");

    const nextStatus = (pendingCount ?? 0) > 0 ? "resolving_conflicts" : (reviewCount ?? 0) > 0 ? "awaiting_conflicts" : "ready_to_apply";

    await auth.service
      .schema("imports").from("import_runs")
      .update({
        status: nextStatus
      })
      .eq("id", payload.run_id)
      .eq("org_id", payload.org_id);

    return json({
      ok: true,
      auto_applied: autoApplied,
      needs_review: needsReview,
      pending_ai: pendingCount ?? 0,
      pending_manual_review: reviewCount ?? 0
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unhandled resolver error."
      },
      500
    );
  }
});
