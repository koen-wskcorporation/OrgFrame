import { createSupabaseServer } from "@/src/shared/data-api/server";
import { aiActAuditDetailSchema } from "@/src/features/ai/schemas";
import type { AiActAuditDetail, AiResolvedOrg } from "@/src/features/ai/types";

type AuditRow = {
  id: string;
  org_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail_json: unknown;
  created_at: string;
  updated_at: string;
};

const auditSelect = "id, org_id, actor_user_id, action, entity_type, entity_id, detail_json, created_at, updated_at";

function normalizeDetail(detail: unknown): AiActAuditDetail {
  const parsed = aiActAuditDetailSchema.safeParse(detail);

  if (!parsed.success) {
    throw new Error("Invalid AI audit detail payload.");
  }

  return parsed.data as unknown as AiActAuditDetail;
}

export async function createActAuditLog(input: {
  org: AiResolvedOrg;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail: AiActAuditDetail;
}) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("ai").from("audit_logs")
    .insert({
      org_id: input.org.orgId,
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      detail_json: input.detail
    })
    .select(auditSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create AI audit log: ${error.message}`);
  }

  const row = data as AuditRow;

  return {
    id: row.id,
    orgId: row.org_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: normalizeDetail(row.detail_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getActAuditLogForActor(proposalId: string, actorUserId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("ai").from("audit_logs")
    .select(auditSelect)
    .eq("id", proposalId)
    .eq("actor_user_id", actorUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load AI audit log: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as AuditRow;

  return {
    id: row.id,
    orgId: row.org_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: normalizeDetail(row.detail_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function updateActAuditLog(input: {
  proposalId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail: AiActAuditDetail;
}) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("ai").from("audit_logs")
    .update({
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      detail_json: input.detail
    })
    .eq("id", input.proposalId)
    .eq("actor_user_id", input.actorUserId)
    .select(auditSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update AI audit log: ${error.message}`);
  }

  const row = data as AuditRow;

  return {
    id: row.id,
    orgId: row.org_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: normalizeDetail(row.detail_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
