"use server";

import { z } from "zod";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { requirePermission } from "@/src/shared/permissions/requirePermission";
import { listAuditEvents } from "@/src/features/audit/db/queries";
import type { AuditPage, AuditQuery } from "@/src/features/audit/types";

const querySchema = z.object({
  orgSlug: z.string().trim().min(1),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
  actorUserId: z.string().uuid().optional(),
  onBehalfOfUserId: z.string().uuid().optional(),
  involvingUserId: z.string().uuid().optional(),
  actorKind: z.enum(["user", "ai", "system"]).optional(),
  status: z.enum(["success", "failure"]).optional(),
  source: z.enum(["trigger", "app", "ai", "system"]).optional(),
  actionPrefix: z.string().trim().min(1).max(120).optional(),
  targetSchema: z.string().trim().min(1).max(63).optional(),
  targetTable: z.string().trim().min(1).max(63).optional(),
  targetId: z.string().trim().min(1).max(120).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional()
});

export async function getAuditEventsPage(input: AuditQuery): Promise<AuditPage> {
  const parsed = querySchema.parse(input);
  const orgContext = await getOrgAuthContext(parsed.orgSlug);
  requirePermission(orgContext.membershipPermissions, "audit.read");

  const supabase = await createSupabaseServer();
  const { orgSlug, ...rest } = parsed;
  void orgSlug;
  return listAuditEvents(supabase, orgContext.orgId, rest);
}

export async function getAuditEventsCsv(input: AuditQuery): Promise<string> {
  const page = await getAuditEventsPage({ ...input, page: 1, pageSize: 200 });

  const headers = [
    "occurred_at",
    "action",
    "status",
    "actor_kind",
    "actor_email",
    "on_behalf_of_email",
    "target_schema",
    "target_table",
    "target_id",
    "summary",
    "request_id"
  ];

  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const lines = [headers.join(",")];
  for (const event of page.events) {
    lines.push(
      [
        event.occurredAt,
        event.action,
        event.status,
        event.actorKind,
        event.actor?.email ?? "",
        event.onBehalfOf?.email ?? "",
        event.targetSchema ?? "",
        event.targetTable ?? "",
        event.targetId ?? "",
        event.summary ?? "",
        event.requestId ?? ""
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}
