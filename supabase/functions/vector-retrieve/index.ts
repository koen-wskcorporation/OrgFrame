import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AI_GATEWAY_API_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? "";
const AI_GATEWAY_BASE_URL = Deno.env.get("AI_GATEWAY_BASE_URL") ?? "https://ai-gateway.vercel.sh/v1";
const AI_EMBEDDING_MODEL = Deno.env.get("AI_EMBEDDING_MODEL") ?? Deno.env.get("AI_MODEL") ?? "google/gemini-embedding-001";
const VECTOR_BUCKET = Deno.env.get("VECTOR_BUCKET") ?? "orgframe-embeddings";
const VECTOR_INDEX = Deno.env.get("VECTOR_INDEX") ?? "orgframe-documents";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

type RetrievePayload = {
  org_id: string;
  query: string;
  top_k?: number;
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

  const { data: hasPermission } = await userClient.rpc("has_org_permission", {
    target_org_id: orgId,
    required_permission: "org.dashboard.read",
  });
  if (hasPermission !== true) {
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

async function fetchEmbedding(text: string): Promise<number[]> {
  if (!AI_GATEWAY_API_KEY) {
    throw new Error("Missing AI gateway API key.");
  }

  const response = await fetch(`${AI_GATEWAY_BASE_URL.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_GATEWAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const values = Array.isArray(data.data) ? data.data[0]?.embedding : null;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding API returned no vector values.");
  }
  return values;
}

async function queryVectors(input: { service: ReturnType<typeof createClient>; embedding: number[]; orgId: string; topK: number }) {
  const bucket = input.service.storage.vectors.from(VECTOR_BUCKET);
  const index = (bucket as any).index(VECTOR_INDEX);
  const filter = {
    organization_id: input.orgId,
  };

  let result: any = null;
  if (typeof index.query === "function") {
    result = await index.query({
      query: {
        float32: input.embedding,
      },
      limit: input.topK,
      includeMetadata: true,
      filter,
    });
  } else if (typeof index.queryVectors === "function") {
    result = await index.queryVectors({
      query: {
        float32: input.embedding,
      },
      limit: input.topK,
      include_metadata: true,
      filter,
    });
  } else {
    throw new Error("Vector query API is unavailable in this runtime.");
  }

  const error = result?.error;
  if (error) {
    throw new Error(`Vector query failed: ${error.message ?? "unknown"}`);
  }

  const rawMatches = result?.data?.matches ?? result?.data?.vectors ?? result?.data ?? [];
  const matches = Array.isArray(rawMatches) ? rawMatches : [];

  return matches.map((entry: Record<string, unknown>) => {
    const metadata = entry.metadata && typeof entry.metadata === "object" ? (entry.metadata as Record<string, unknown>) : {};
    return {
      key: cleanText(entry.key),
      score: typeof entry.score === "number" ? entry.score : null,
      metadata,
    };
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = (await request.json()) as RetrievePayload;
    const orgId = cleanText(payload.org_id);
    const query = cleanText(payload.query);
    const topK = Math.max(1, Math.min(20, Number(payload.top_k ?? 6) || 6));

    if (!orgId || !query) {
      return json({ error: "Invalid payload." }, 400);
    }

    const auth = await requireAuthorizedClient(request, orgId);
    if ("error" in auth) {
      return auth.error;
    }

    const embedding = await fetchEmbedding(query);
    const matches = await queryVectors({
      service: auth.service,
      embedding,
      orgId,
      topK,
    });

    return json({
      ok: true,
      org_id: orgId,
      query,
      top_k: topK,
      matches,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
