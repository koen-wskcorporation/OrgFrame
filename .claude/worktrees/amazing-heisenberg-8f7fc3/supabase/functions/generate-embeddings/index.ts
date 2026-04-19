import { createClient } from "npm:@supabase/supabase-js@2";

type DatabaseWebhookEvent = "INSERT" | "UPDATE" | "DELETE";

type DatabaseWebhookPayload = {
  type: DatabaseWebhookEvent;
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

type VectorBucketError = {
  message?: string;
  statusCode?: number;
  status?: number;
};

type TableHandler = {
  buildContent: (record: Record<string, unknown>) => string;
  resolveSourceId: (record: Record<string, unknown>) => string | null;
  resolveOrganizationId: (input: {
    record: Record<string, unknown>;
    event: DatabaseWebhookPayload;
    supabase: ReturnType<typeof createClient>;
  }) => Promise<string | null>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_GATEWAY_API_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? "";
const AI_GATEWAY_BASE_URL = Deno.env.get("AI_GATEWAY_BASE_URL") ?? "https://ai-gateway.vercel.sh/v1";
const AI_EMBEDDING_MODEL = Deno.env.get("AI_EMBEDDING_MODEL") ?? Deno.env.get("AI_MODEL") ?? "google/gemini-embedding-001";
const VECTOR_BUCKET = Deno.env.get("VECTOR_BUCKET") ?? "orgframe-embeddings";
const VECTOR_INDEX = Deno.env.get("VECTOR_INDEX") ?? "orgframe-documents";
const VECTOR_DISTANCE_METRIC = Deno.env.get("VECTOR_DISTANCE_METRIC") ?? "cosine";
const WEBHOOK_SECRET = Deno.env.get("EMBEDDINGS_WEBHOOK_SECRET")?.trim() ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const PLAYER_CONTENT_FIELDS = [
  ["First name", "first_name"],
  ["Last name", "last_name"],
  ["Preferred name", "preferred_name"],
  ["Date of birth", "date_of_birth"],
  ["Gender", "gender"],
  ["Jersey size", "jersey_size"],
  ["Medical notes", "medical_notes"],
  ["Allergies", "allergies"],
  ["Physical conditions", "physical_conditions"],
  ["Insurance company", "insurance_company"],
  ["Insurance policy holder", "insurance_policy_holder"]
] as const;

const PROGRAM_TEAM_CONTENT_FIELDS = [
  ["Status", "status"],
  ["Team code", "team_code"],
  ["Level label", "level_label"],
  ["Age group", "age_group"],
  ["Gender", "gender"],
  ["Primary color", "color_primary"],
  ["Secondary color", "color_secondary"],
  ["Notes", "notes"]
] as const;

const CALENDAR_ITEM_CONTENT_FIELDS = [
  ["Title", "title"],
  ["Summary", "summary"],
  ["Location", "location"],
  ["Timezone", "timezone"],
  ["Status", "status"],
  ["Item type", "item_type"],
  ["Visibility", "visibility"],
  ["Purpose", "purpose"],
  ["Audience", "audience"],
  ["Host team", "host_team_id"]
] as const;

let ensuredIndexDimension: number | null = null;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusCodeOf(error: unknown): number | null {
  const candidate = error as VectorBucketError;

  if (typeof candidate.statusCode === "number") {
    return candidate.statusCode;
  }

  if (typeof candidate.status === "number") {
    return candidate.status;
  }

  return null;
}

function messageOf(error: unknown): string {
  const candidate = error as VectorBucketError;
  return typeof candidate.message === "string" ? candidate.message : String(error);
}

function isAlreadyExistsError(error: unknown): boolean {
  const status = statusCodeOf(error);
  if (status === 409) {
    return true;
  }

  const message = messageOf(error).toLowerCase();
  return message.includes("already") && message.includes("exist");
}

function isNotFoundError(error: unknown): boolean {
  const status = statusCodeOf(error);
  if (status === 404) {
    return true;
  }

  const message = messageOf(error).toLowerCase();
  return message.includes("not found") || message.includes("does not exist") || message.includes("missing");
}

function readOrganizationIdFromRecord(record: Record<string, unknown>): string | null {
  const directCandidates = [
    asNonEmptyString(record.organization_id),
    asNonEmptyString(record.org_id)
  ].filter((candidate): candidate is string => Boolean(candidate && isUuid(candidate)));

  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  const metadata = asObject(record.metadata_json);
  const metadataCandidates = [
    asNonEmptyString(metadata.organization_id),
    asNonEmptyString(metadata.org_id)
  ].filter((candidate): candidate is string => Boolean(candidate && isUuid(candidate)));

  return metadataCandidates.length > 0 ? metadataCandidates[0] : null;
}

function buildContentFromFields(input: {
  recordType: string;
  record: Record<string, unknown>;
  fields: ReadonlyArray<readonly [string, string]>;
  jsonFields?: string[];
}): string {
  const lines = [`Record type: ${input.recordType}`];

  for (const [label, fieldName] of input.fields) {
    const value = input.record[fieldName];
    const serialized =
      typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);

    if (serialized.length > 0) {
      lines.push(`${label}: ${serialized}`);
    }
  }

  for (const jsonField of input.jsonFields ?? []) {
    const jsonValue = asObject(input.record[jsonField]);
    const summary = Object.entries(jsonValue)
      .filter(([, value]) => value !== null && value !== "")
      .slice(0, 12)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");

    if (summary.length > 0) {
      lines.push(`${jsonField}: ${summary}`);
    }
  }

  return lines.join("\n");
}

function buildGenericContent(record: Record<string, unknown>, recordType: string): string {
  const lines = [`Record type: ${recordType}`];
  const entries = Object.entries(record)
    .filter(([key]) => !["id", "org_id", "organization_id", "created_at", "updated_at"].includes(key))
    .slice(0, 32);

  for (const [key, value] of entries) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        lines.push(`${key}: ${trimmed}`);
      }
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${String(value)}`);
      continue;
    }

    if (Array.isArray(value)) {
      const preview = value.slice(0, 10).map((entry) => String(entry)).join(", ");
      if (preview.length > 0) {
        lines.push(`${key}: ${preview}`);
      }
      continue;
    }

    if (typeof value === "object") {
      const summary = Object.entries(asObject(value))
        .slice(0, 10)
        .map(([nestedKey, nestedValue]) => `${nestedKey}=${String(nestedValue)}`)
        .join(", ");

      if (summary.length > 0) {
        lines.push(`${key}: ${summary}`);
      }
    }
  }

  return lines.join("\n");
}

function vectorKeyFor(input: { schema: string; table: string; sourceId: string }): string {
  return `${input.schema}.${input.table}:${input.sourceId}`;
}

async function fetchGatewayEmbedding(text: string): Promise<number[]> {
  if (!AI_GATEWAY_API_KEY) {
    throw new Error("Missing AI_GATEWAY_API_KEY.");
  }

  const response = await fetch(
    `${AI_GATEWAY_BASE_URL.replace(/\/$/, "")}/embeddings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_GATEWAY_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: AI_EMBEDDING_MODEL,
        input: text
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding API request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data?: Array<{
      embedding?: number[];
    }>;
  };

  const values = Array.isArray(data.data) ? data.data[0]?.embedding : null;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding API returned no vector values.");
  }

  return values;
}

function vectorBucketClient() {
  return supabase.storage.vectors.from(VECTOR_BUCKET);
}

async function ensureBucketAndIndex(dimension: number): Promise<void> {
  if (ensuredIndexDimension === dimension) {
    return;
  }

  const { error: bucketError } = await supabase.storage.vectors.createBucket(VECTOR_BUCKET);
  if (bucketError && !isAlreadyExistsError(bucketError)) {
    throw new Error(`Failed creating vector bucket '${VECTOR_BUCKET}': ${bucketError.message}`);
  }

  const bucket = vectorBucketClient();
  const { data: existingIndex, error: getIndexError } = await bucket.getIndex(VECTOR_INDEX);

  if (getIndexError) {
    if (!isNotFoundError(getIndexError)) {
      throw new Error(`Failed reading vector index '${VECTOR_INDEX}': ${getIndexError.message}`);
    }

    const { error: createIndexError } = await bucket.createIndex({
      indexName: VECTOR_INDEX,
      dataType: "float32",
      dimension,
      distanceMetric: VECTOR_DISTANCE_METRIC
    });

    if (createIndexError && !isAlreadyExistsError(createIndexError)) {
      throw new Error(`Failed creating vector index '${VECTOR_INDEX}': ${createIndexError.message}`);
    }

    ensuredIndexDimension = dimension;
    return;
  }

  const existingDimension = typeof existingIndex?.dimension === "number" ? existingIndex.dimension : null;
  if (existingDimension !== null && existingDimension !== dimension) {
    throw new Error(
      `Vector index '${VECTOR_INDEX}' dimension mismatch. Existing=${existingDimension}, incoming=${dimension}.`
    );
  }

  ensuredIndexDimension = dimension;
}

async function deleteVectorByKey(key: string): Promise<void> {
  const bucket = vectorBucketClient();

  const { error: getIndexError } = await bucket.getIndex(VECTOR_INDEX);
  if (getIndexError) {
    if (isNotFoundError(getIndexError)) {
      return;
    }

    throw new Error(`Failed reading vector index '${VECTOR_INDEX}': ${getIndexError.message}`);
  }

  const index = bucket.index(VECTOR_INDEX);
  const { error } = await index.deleteVectors({ keys: [key] });

  if (error && !isNotFoundError(error)) {
    throw new Error(`Failed deleting vector '${key}': ${error.message}`);
  }
}

async function putVector(input: {
  key: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content: string;
}): Promise<void> {
  await ensureBucketAndIndex(input.embedding.length);

  const index = vectorBucketClient().index(VECTOR_INDEX);
  const { error } = await index.putVectors({
    vectors: [
      {
        key: input.key,
        data: {
          float32: input.embedding
        },
        metadata: {
          ...input.metadata,
          content: input.content,
          updated_at: new Date().toISOString()
        }
      }
    ]
  });

  if (error) {
    throw new Error(`Failed storing vector '${input.key}': ${error.message}`);
  }
}

const tableHandlers: Record<string, TableHandler> = {
  players: {
    buildContent(record) {
      return buildContentFromFields({
        recordType: "Player",
        record,
        fields: PLAYER_CONTENT_FIELDS,
        jsonFields: ["metadata_json"]
      });
    },

    resolveSourceId(record) {
      const id = asNonEmptyString(record.id);
      return id ?? null;
    },

    async resolveOrganizationId({ record, supabase: client }) {
      const directOrgId = readOrganizationIdFromRecord(record);
      if (directOrgId) {
        return directOrgId;
      }

      const playerId = asNonEmptyString(record.id);
      if (!playerId) {
        return null;
      }

      const { data, error } = await client
        .from("program_registrations")
        .select("org_id")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Unable to resolve org_id for player ${playerId}: ${error.message}`);
      }

      const orgId = asNonEmptyString(data?.org_id);
      return orgId && isUuid(orgId) ? orgId : null;
    }
  },
  program_teams: {
    buildContent(record) {
      return buildContentFromFields({
        recordType: "Program Team",
        record,
        fields: PROGRAM_TEAM_CONTENT_FIELDS,
        jsonFields: ["settings_json"]
      });
    },
    resolveSourceId(record) {
      const id = asNonEmptyString(record.id);
      return id ?? null;
    },
    async resolveOrganizationId({ record }) {
      const orgId = readOrganizationIdFromRecord(record);
      return orgId && isUuid(orgId) ? orgId : null;
    }
  },
  calendar_items: {
    buildContent(record) {
      return buildContentFromFields({
        recordType: "Calendar Item",
        record,
        fields: CALENDAR_ITEM_CONTENT_FIELDS,
        jsonFields: ["settings", "metadata"]
      });
    },
    resolveSourceId(record) {
      const id = asNonEmptyString(record.id);
      return id ?? null;
    },
    async resolveOrganizationId({ record }) {
      const orgId = readOrganizationIdFromRecord(record);
      return orgId && isUuid(orgId) ? orgId : null;
    }
  }
};

function authorizeRequest(req: Request): boolean {
  if (!WEBHOOK_SECRET) {
    return true;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${WEBHOOK_SECRET}`;
}

Deno.serve(async (req: Request) => {
  if (!authorizeRequest(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  let payload: DatabaseWebhookPayload;

  try {
    payload = (await req.json()) as DatabaseWebhookPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json_payload" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const handler: TableHandler = tableHandlers[payload.table] ?? {
      buildContent(record: Record<string, unknown>) {
        return buildGenericContent(record, payload.table);
      },
      resolveSourceId(record: Record<string, unknown>) {
        return asNonEmptyString(record.id);
      },
      async resolveOrganizationId({ record }) {
        const orgId = readOrganizationIdFromRecord(record);
        return orgId && isUuid(orgId) ? orgId : null;
      }
    };

    const activeRecord = payload.type === "DELETE" ? payload.old_record : payload.record;
    if (!activeRecord) {
      return new Response(JSON.stringify({ error: "missing_record_payload" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const sourceId = handler.resolveSourceId(activeRecord);
    if (!sourceId) {
      return new Response(JSON.stringify({ error: "missing_source_id" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const vectorKey = vectorKeyFor({
      schema: payload.schema,
      table: payload.table,
      sourceId
    });

    if (payload.type === "DELETE") {
      await deleteVectorByKey(vectorKey);

      return new Response(JSON.stringify({ ok: true, deleted: true, key: vectorKey }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    const organizationId = await handler.resolveOrganizationId({
      record: activeRecord,
      event: payload,
      supabase
    });

    if (!organizationId) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          reason: "organization_id_not_found",
          sourceTable: payload.table,
          sourceId
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const content = handler.buildContent(activeRecord);
    const embedding = await fetchGatewayEmbedding(content);

    await deleteVectorByKey(vectorKey);

    const metadata = {
      source_schema: payload.schema,
      source_table: payload.table,
      source_id: sourceId,
      organization_id: organizationId,
      event_type: payload.type
    };

    await putVector({
      key: vectorKey,
      embedding,
      metadata,
      content
    });

    return new Response(
      JSON.stringify({
        ok: true,
        key: vectorKey,
        sourceTable: payload.table,
        sourceId,
        dimensions: embedding.length,
        bucket: VECTOR_BUCKET,
        index: VECTOR_INDEX
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  } catch (error) {
    console.error("generate-embeddings error", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error"
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }
});
