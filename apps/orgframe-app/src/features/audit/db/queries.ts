import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditActorProfile,
  AuditEvent,
  AuditEventWithActor,
  AuditPage,
  AuditQuery
} from "@/src/features/audit/types";

const eventColumns =
  "id, org_id, occurred_at, actor_user_id, actor_kind, on_behalf_of_user_id, action, target_schema, target_table, target_id, status, source, summary, diff, metadata, request_id";

type AuditRow = {
  id: string;
  org_id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_kind: AuditEvent["actorKind"];
  on_behalf_of_user_id: string | null;
  action: string;
  target_schema: string | null;
  target_table: string | null;
  target_id: string | null;
  status: AuditEvent["status"];
  source: AuditEvent["source"];
  summary: string | null;
  diff: unknown;
  metadata: Record<string, unknown> | null;
  request_id: string | null;
};

function rowToEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    occurredAt: row.occurred_at,
    actorUserId: row.actor_user_id,
    actorKind: row.actor_kind,
    onBehalfOfUserId: row.on_behalf_of_user_id,
    action: row.action,
    targetSchema: row.target_schema,
    targetTable: row.target_table,
    targetId: row.target_id,
    status: row.status,
    source: row.source,
    summary: row.summary,
    diff: row.diff,
    metadata: row.metadata,
    requestId: row.request_id
  };
}

export async function listAuditEvents(
  supabase: SupabaseClient<any>,
  orgId: string,
  query: Omit<AuditQuery, "orgSlug">
): Promise<AuditPage> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .schema("audit").from("events")
    .select(eventColumns, { count: "exact" })
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false });

  if (query.actorUserId) q = q.eq("actor_user_id", query.actorUserId);
  if (query.onBehalfOfUserId) q = q.eq("on_behalf_of_user_id", query.onBehalfOfUserId);
  if (query.actorKind) q = q.eq("actor_kind", query.actorKind);
  if (query.status) q = q.eq("status", query.status);
  if (query.source) q = q.eq("source", query.source);
  if (query.targetSchema) q = q.eq("target_schema", query.targetSchema);
  if (query.targetTable) q = q.eq("target_table", query.targetTable);
  if (query.targetId) q = q.eq("target_id", query.targetId);
  if (query.actionPrefix) q = q.like("action", `${query.actionPrefix}%`);
  if (query.fromDate) q = q.gte("occurred_at", query.fromDate);
  if (query.toDate) q = q.lte("occurred_at", query.toDate);
  if (query.involvingUserId) {
    q = q.or(
      `actor_user_id.eq.${query.involvingUserId},on_behalf_of_user_id.eq.${query.involvingUserId}`
    );
  }

  const { data, error, count } = await q.range(from, to);
  if (error) {
    throw new Error(`Failed to load audit events: ${error.message}`);
  }

  const events = (data as AuditRow[] | null)?.map(rowToEvent) ?? [];
  const actors = await loadActorProfiles(supabase, events);

  const enriched: AuditEventWithActor[] = events.map((event) => ({
    ...event,
    actor: event.actorUserId ? actors.get(event.actorUserId) ?? null : null,
    onBehalfOf: event.onBehalfOfUserId ? actors.get(event.onBehalfOfUserId) ?? null : null
  }));

  return {
    events: enriched,
    total: count ?? enriched.length,
    page,
    pageSize
  };
}

async function loadActorProfiles(
  supabase: SupabaseClient<any>,
  events: AuditEvent[]
): Promise<Map<string, AuditActorProfile>> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.actorUserId) ids.add(event.actorUserId);
    if (event.onBehalfOfUserId) ids.add(event.onBehalfOfUserId);
  }
  if (ids.size === 0) return new Map();

  const { data, error } = await supabase
    .schema("people").from("users")
    .select("user_id, email, first_name, last_name")
    .in("user_id", Array.from(ids));

  const map = new Map<string, AuditActorProfile>();
  if (error || !data) return map;

  for (const row of data as Array<{
    user_id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  }>) {
    map.set(row.user_id, {
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name
    });
  }
  return map;
}
