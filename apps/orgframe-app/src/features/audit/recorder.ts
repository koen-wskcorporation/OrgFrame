import { createDataApiServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import type { AuditActorKind, AuditSource, AuditStatus } from "@/src/features/audit/types";

export type RecordAuditEventInput = {
  orgId: string;
  action: string;
  status?: AuditStatus;
  source?: AuditSource;
  targetSchema?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  summary?: string | null;
  diff?: unknown;
  metadata?: Record<string, unknown> | null;
  actorUserId?: string | null;
  actorKind?: AuditActorKind | null;
  onBehalfOfUserId?: string | null;
  requestId?: string | null;
  /** Set true to use the service-role client (e.g. background jobs). */
  useServiceRole?: boolean;
};

/**
 * Record a business-level audit event. Triggers cover automatic row writes;
 * call this for things like logins, exports, AI tool runs, role changes —
 * anything where we want a richer description than a raw row diff.
 *
 * Failures are swallowed: an audit miss must never break the action that
 * produced it.
 */
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    const client = input.useServiceRole
      ? createDataApiServiceRoleClient()
      : await createSupabaseServer();

    await (client as any).schema("audit").rpc("record_event", {
      p_org_id: input.orgId,
      p_action: input.action,
      p_target_schema: input.targetSchema ?? null,
      p_target_table: input.targetTable ?? null,
      p_target_id: input.targetId ?? null,
      p_status: input.status ?? "success",
      p_source: input.source ?? "app",
      p_summary: input.summary ?? null,
      p_diff: input.diff ?? null,
      p_metadata: input.metadata ?? null,
      p_actor_user_id: input.actorUserId ?? null,
      p_actor_kind: input.actorKind ?? null,
      p_on_behalf_of_user_id: input.onBehalfOfUserId ?? null,
      p_request_id: input.requestId ?? null
    });
  } catch {
    // Intentional: never throw from the audit path.
  }
}
