export type AuditActorKind = "user" | "ai" | "system";
export type AuditStatus = "success" | "failure";
export type AuditSource = "trigger" | "app" | "ai" | "system";

export type AuditEvent = {
  id: string;
  orgId: string;
  occurredAt: string;
  actorUserId: string | null;
  actorKind: AuditActorKind;
  onBehalfOfUserId: string | null;
  action: string;
  targetSchema: string | null;
  targetTable: string | null;
  targetId: string | null;
  status: AuditStatus;
  source: AuditSource;
  summary: string | null;
  diff: unknown;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
};

export type AuditActorProfile = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type AuditEventWithActor = AuditEvent & {
  actor: AuditActorProfile | null;
  onBehalfOf: AuditActorProfile | null;
};

export type AuditQuery = {
  orgSlug: string;
  page?: number;
  pageSize?: number;
  actorUserId?: string;
  onBehalfOfUserId?: string;
  actorKind?: AuditActorKind;
  status?: AuditStatus;
  source?: AuditSource;
  actionPrefix?: string;
  targetSchema?: string;
  targetTable?: string;
  targetId?: string;
  /** Either-or convenience for the per-user profile tab. */
  involvingUserId?: string;
  fromDate?: string;
  toDate?: string;
};

export type AuditPage = {
  events: AuditEventWithActor[];
  total: number;
  page: number;
  pageSize: number;
};
