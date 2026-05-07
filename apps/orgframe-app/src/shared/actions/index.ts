import "server-only";
import {
  createActionFactory,
  createSupabaseAuditWriter,
  createMemoryRateLimiter,
  ActionError,
  ok,
  fail,
  type ActionResult
} from "@orgframe/db-client";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { createDataApiServiceRoleClient } from "@/src/shared/data-api/server";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import type { Permission } from "@/src/features/core/access";
import type { OrgAuthContext } from "@/src/shared/org/types";

const auditWriter = createSupabaseAuditWriter(() => {
  const client = createDataApiServiceRoleClient() as unknown as {
    from: (table: string) => { insert: (row: unknown) => Promise<{ error: unknown }> };
  };
  return client;
});

// Default per-action throttle: 60 calls per minute per (org,user,action).
// Memory-only — fine for dev and single-region; swap for a Redis-backed
// limiter once we run multi-region.
const rateLimiter = createMemoryRateLimiter({ capacity: 60, windowMs: 60_000 });

const factory = createActionFactory<OrgAuthContext, Permission>({
  resolveAuthContext: getOrgAuthContext,
  getPermissions: (auth) => auth.membershipPermissions,
  getOrgId: (auth) => auth.orgId,
  getUserId: (auth) => auth.userId,
  rethrowNavigation: rethrowIfNavigationError,
  audit: auditWriter,
  rateLimiter,
  logger: {
    error: (msg, meta) => {
      // eslint-disable-next-line no-console
      console.error(msg, meta);
    }
  }
});

export const defineOrgAction = factory.defineOrgAction;
export { ActionError, ok, fail };
export type { ActionResult };
