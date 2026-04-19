import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

type RequestPayload = {
  action: "start_run" | "process_batch";
  org_id: string;
  org_slug?: string;
  run_id?: string;
  profile?: "people_roster" | "program_structure" | "commerce_orders";
  batch_size?: number;
  file?: {
    id: string;
    bucket: string;
    path: string;
    name: string;
    mime_type?: string | null;
    size_bytes?: number | null;
  };
};

type Candidate = {
  id: string;
  score: number;
  reason: string;
  payload: Record<string, unknown>;
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

function canonicalKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function aliasesByProfile(profile: string): Record<string, string[]> {
  if (profile === "people_roster") {
    return {
      first_name: ["first", "given_name", "player_first_name"],
      last_name: ["last", "surname", "player_last_name"],
      preferred_name: ["nickname"],
      email: ["guardian_email", "contact_email"],
      phone: ["guardian_phone", "contact_phone"],
      date_of_birth: ["dob", "birth_date"]
    };
  }

  if (profile === "program_structure") {
    return {
      program_name: ["program", "program_title"],
      division_name: ["division", "division_title"],
      team_name: ["team", "team_title"],
      node_kind: ["kind", "type"]
    };
  }

  return {
    source_order_id: ["order_id", "external_order_id"],
    source_order_no: ["order_number", "external_order_no"],
    order_status: ["status"],
    total_amount: ["order_total", "total"],
    order_date: ["date", "ordered_at"]
  };
}

function canonicalize(raw: Record<string, unknown>, aliases: Record<string, string[]>) {
  const output: Record<string, unknown> = {};
  const keys = Object.keys(raw);

  for (const key of keys) {
    output[canonicalKey(key)] = raw[key];
  }

  for (const [canonical, aliasList] of Object.entries(aliases)) {
    const matchedKey = keys.find((key) => {
      const normalized = canonicalKey(key);
      return normalized === canonical || aliasList.some((alias) => normalized === canonicalKey(alias));
    });
    output[canonical] = matchedKey ? raw[matchedKey] : null;
  }

  return output;
}

async function hashRow(raw: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(raw)));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function decodeText(bytes: Uint8Array) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const nulCount = Array.from(utf8).reduce((count, ch) => (ch === "\u0000" ? count + 1 : count), 0);
  if (nulCount > Math.max(4, Math.floor(utf8.length * 0.02))) {
    return new TextDecoder("utf-16le").decode(bytes);
  }

  return utf8;
}

function parseCsv(input: string): Array<Record<string, unknown>> {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0]?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
  if (headers.length === 0) {
    return [];
  }

  const parsed: Array<Record<string, unknown>> = [];
  for (const values of rows.slice(1)) {
    const record: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i] ?? "";
      record[header] = values[i] ?? "";
    }

    const hasValue = Object.values(record).some((value) => clean(value).length > 0);
    if (hasValue) {
      parsed.push(record);
    }
  }

  return parsed;
}

function parseWorkbook(bytes: Uint8Array): Array<Record<string, unknown>> {
  try {
    const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return parseCsv(decodeText(bytes));
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return parseCsv(decodeText(bytes));
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false
    });

    if (rows.length === 0) {
      return parseCsv(decodeText(bytes));
    }

    return rows.map((row) => asObject(row));
  } catch {
    return parseCsv(decodeText(bytes));
  }
}

async function resolveCandidates(input: {
  service: ReturnType<typeof createClient>;
  orgId: string;
  profile: string;
  canonical: Record<string, unknown>;
}): Promise<Candidate[]> {
  if (input.profile === "people_roster") {
    const firstName = clean(input.canonical.first_name);
    const lastName = clean(input.canonical.last_name);
    if (!firstName || !lastName) {
      return [];
    }

    const { data } = await input.service
      .schema("people").from("players")
      .select("id, first_name, last_name, preferred_name")
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(5);

    return (data ?? []).map((row) => ({
      id: String(row.id),
      score: 0.9,
      reason: "name_match",
      payload: asObject(row)
    }));
  }

  if (input.profile === "program_structure") {
    const candidateName = clean(input.canonical.team_name) || clean(input.canonical.division_name) || clean(input.canonical.program_name);
    if (!candidateName) {
      return [];
    }

    const { data } = await input.service
      .schema("programs").from("program_structure_nodes")
      .select("id, name, node_kind")
      .eq("org_id", input.orgId)
      .ilike("name", candidateName)
      .limit(5);

    return (data ?? []).map((row) => ({
      id: String(row.id),
      score: 0.9,
      reason: "name_match",
      payload: asObject(row)
    }));
  }

  const sourceOrderId = clean(input.canonical.source_order_id);
  const sourceOrderNo = clean(input.canonical.source_order_no);

  if (!sourceOrderId && !sourceOrderNo) {
    return [];
  }

  let query = input.service
    .schema("commerce").from("orders")
    .select("id, source_order_id, source_order_no, order_status")
    .eq("org_id", input.orgId)
    .limit(5);

  query = sourceOrderId ? query.eq("source_order_id", sourceOrderId) : query.eq("source_order_no", sourceOrderNo);

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    score: 0.98,
    reason: "source_order_match",
    payload: asObject(row)
  }));
}

function classifyMatch(candidates: Candidate[]) {
  if (candidates.length === 0) {
    return "direct";
  }

  if (candidates.length === 1 && candidates[0] && candidates[0].score >= 0.95) {
    return "direct";
  }

  return "conflict";
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

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = (await request.json()) as RequestPayload;
    if (!payload.org_id || !payload.action) {
      return json({ error: "Invalid payload." }, 400);
    }

    const auth = await requireAuthorizedClient(request, payload.org_id);
    if ("error" in auth) {
      return auth.error;
    }

    if (payload.action === "start_run") {
      if (!payload.file) {
        return json({ error: "Missing file for start_run." }, 400);
      }

      const profile = payload.profile ?? "people_roster";

      const { data, error } = await auth.service
        .schema("imports").from("import_runs")
        .insert({
          org_id: payload.org_id,
          created_by_user_id: auth.user.id,
          profile_key: profile,
          status: "queued",
          progress: 0,
          source_bucket: payload.file.bucket,
          source_path: payload.file.path,
          source_filename: payload.file.name,
          source_mime: payload.file.mime_type ?? null,
          source_size_bytes: payload.file.size_bytes ?? null,
          summary_json: {}
        })
        .select("id, status, progress")
        .single();

      if (error) {
        return json({ error: `Failed to create run: ${error.message}` }, 500);
      }

      return json({
        ok: true,
        run_id: data.id,
        status: data.status,
        progress: data.progress
      });
    }

    if (!payload.run_id) {
      return json({ error: "Missing run_id for process_batch." }, 400);
    }

    const { data: run, error: runError } = await auth.service
      .schema("imports").from("import_runs")
      .select("id, org_id, profile_key, source_bucket, source_path, source_filename, row_count, status")
      .eq("id", payload.run_id)
      .eq("org_id", payload.org_id)
      .maybeSingle();

    if (runError || !run) {
      return json({ error: "Run not found." }, 404);
    }

    if (run.status === "cancelled" || run.status === "undone") {
      return json({
        ok: true,
        run_id: run.id,
        status: run.status
      });
    }

    await auth.service
      .schema("imports").from("import_runs")
      .update({
        status: "processing",
        started_at: new Date().toISOString()
      })
      .eq("id", run.id);

    const existingRows = await auth.service
      .schema("imports").from("import_rows")
      .select("id", { head: true, count: "exact" })
      .eq("run_id", run.id);

    if ((existingRows.count ?? 0) === 0) {
      if (!run.source_bucket || !run.source_path) {
        return json({ error: "Run source file is missing." }, 400);
      }

      const { data: fileData, error: fileError } = await auth.service.storage.from(run.source_bucket).download(run.source_path);
      if (fileError || !fileData) {
        return json({ error: "Failed to download source file." }, 500);
      }

      const fileBytes = new Uint8Array(await fileData.arrayBuffer());
      const parsedRows = parseWorkbook(fileBytes);
      const aliases = aliasesByProfile(String(run.profile_key));

      let directCount = 0;
      let conflictCount = 0;

      for (let index = 0; index < parsedRows.length; index += 1) {
        const raw = parsedRows[index] ?? {};
        const canonical = canonicalize(raw, aliases);
        const candidates = await resolveCandidates({
          service: auth.service,
          orgId: payload.org_id,
          profile: String(run.profile_key),
          canonical
        });

        const matchStatus = classifyMatch(candidates);
        const rowHash = await hashRow(raw);

        const { data: rowData, error: rowError } = await auth.service
          .schema("imports").from("import_rows")
          .insert({
            run_id: run.id,
            org_id: payload.org_id,
            profile_key: run.profile_key,
            row_number: index + 1,
            row_hash: rowHash,
            raw_row_json: raw,
            normalized_row_json: canonical,
            validation_status: "valid",
            match_status: matchStatus
          })
          .select("id")
          .single();

        if (rowError || !rowData) {
          return json({ error: `Failed to persist row ${index + 1}: ${rowError?.message ?? "unknown error"}` }, 500);
        }

        if (matchStatus === "direct") {
          directCount += 1;
          continue;
        }

        conflictCount += 1;
        const importedPayload = asObject(canonical);
        await auth.service
          .schema("imports").from("import_conflicts")
          .insert({
            run_id: run.id,
            row_id: rowData.id,
            org_id: payload.org_id,
            profile_key: run.profile_key,
            conflict_type: candidates.length > 0 ? "candidate_ambiguity" : "no_candidate",
            imported_payload_json: importedPayload,
            candidate_records_json: candidates,
            resolution_state: "pending_ai",
            ai_prompt:
              candidates.length > 0
                ? "Multiple candidate matches were found. Review suggestions before applying."
                : "No candidate match was found. Choose insert or skip."
          });
      }

      const status = conflictCount > 0 ? "awaiting_conflicts" : "ready_to_apply";
      await auth.service
        .schema("imports").from("import_runs")
        .update({
          status,
          progress: 100,
          row_count: parsedRows.length,
          summary_json: {
            total_rows: parsedRows.length,
            direct_rows: directCount,
            conflict_rows: conflictCount
          }
        })
        .eq("id", run.id);
    }

    const { count: unresolvedCount } = await auth.service
      .schema("imports").from("import_conflicts")
      .select("id", { head: true, count: "exact" })
      .eq("run_id", run.id)
      .in("resolution_state", ["pending_ai", "needs_review"]);

    await auth.service
      .schema("imports").from("import_runs")
      .update({
        status: (unresolvedCount ?? 0) > 0 ? "awaiting_conflicts" : "ready_to_apply",
        progress: 100
      })
      .eq("id", run.id);

    return json({
      ok: true,
      run_id: run.id,
      unresolved_conflicts: unresolvedCount ?? 0
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unhandled processing error."
      },
      500
    );
  }
});
