/**
 * Audit log writer interface. The default implementation writes a row to
 * `public.audit_logs`; consumers can supply their own (e.g. ship to Axiom
 * in addition).
 */
export type AuditOutcome = "success" | "failure";

export interface AuditEvent {
  orgId: string | null;
  userId: string | null;
  action: string;
  outcome: AuditOutcome;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}

export interface AuditWriter {
  write(event: AuditEvent): Promise<void> | void;
}

/**
 * Best-effort no-op writer. Useful in tests or before the audit_logs table
 * is wired up. Production should pass a real writer to the action factory.
 */
export const noopAuditWriter: AuditWriter = {
  write() {
    /* intentionally empty */
  }
};

/**
 * Build an audit writer that POSTs to a Supabase service-role client.
 * Accepts the client lazily so the package does not depend on
 * @supabase/supabase-js at the type level.
 */
export function createSupabaseAuditWriter(getServiceRoleClient: () => {
  from: (table: string) => { insert: (row: unknown) => Promise<{ error: unknown }> };
}): AuditWriter {
  return {
    async write(event) {
      try {
        const client = getServiceRoleClient();
        await client.from("audit_logs").insert({
          org_id: event.orgId,
          user_id: event.userId,
          action: event.action,
          outcome: event.outcome,
          duration_ms: event.durationMs,
          error_code: event.errorCode ?? null,
          error_message: event.errorMessage ?? null,
          meta: event.meta ?? null
        });
      } catch {
        // Audit write must never break the action it is observing.
      }
    }
  };
}
