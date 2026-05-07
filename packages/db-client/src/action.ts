import { z } from "zod";
import { ActionError, fail, ok, type ActionResult } from "./errors";
import { hasPermission } from "./permissions";
import { type AuditWriter, noopAuditWriter } from "./audit";
import { type RateLimiter, noopRateLimiter, rateLimitError } from "./rate-limit";

/**
 * Anything that bubbles a Next.js redirect/notFound out of a server action
 * MUST be re-thrown — it's the framework's signalling channel, not an error.
 * Consumers pass their app's helper (e.g. rethrowIfNavigationError) so the
 * package stays free of next/navigation.
 */
export type RethrowNavigation = (err: unknown) => void;

export interface ActionFactoryOptions<TAuth, TPermission extends string> {
  /** Resolves the auth context for an action invocation. */
  resolveAuthContext: (orgSlug: string) => Promise<TAuth>;
  /** Pulls the granted permission list off the auth context. */
  getPermissions: (auth: TAuth) => readonly TPermission[];
  /** Pulls the org id off the auth context (for audit). */
  getOrgId: (auth: TAuth) => string | null;
  /** Pulls the user id off the auth context (for audit). */
  getUserId: (auth: TAuth) => string | null;
  /** Re-throws Next.js navigation signals (redirect/notFound). */
  rethrowNavigation?: RethrowNavigation;
  /** Audit log sink. Defaults to no-op. */
  audit?: AuditWriter;
  /** Rate limiter. Defaults to no-op. */
  rateLimiter?: RateLimiter;
  /** Optional logger for unexpected errors. */
  logger?: { error: (msg: string, meta?: unknown) => void };
}

export interface OrgActionConfig<
  TPermission extends string,
  TInput extends z.ZodTypeAny
> {
  /** Stable identifier for audit logs + rate limiting. */
  name: string;
  /** Permission(s) required. Checked before the handler runs. */
  permission?: TPermission | readonly TPermission[];
  /** Zod schema for the input. Inferred type is passed to the handler. */
  input?: TInput;
  /** When true, write an audit log row (default: only on mutations). */
  audit?: boolean;
  /** Rate-limit override (per-action). */
  rateLimit?: { capacity: number; windowMs: number };
}

export interface OrgActionContext<TAuth> {
  auth: TAuth;
}

/**
 * Build an action factory bound to a single app's auth model. Returns a
 * `defineOrgAction` helper that consumers use to wrap their server actions.
 *
 * Usage:
 *   const { defineOrgAction } = createActionFactory({ ... });
 *   export const createEvent = defineOrgAction(
 *     { name: "calendar.createEvent", permission: "calendar.write", input: schema, audit: true },
 *     async ({ auth }, input) => { ... }
 *   );
 */
export function createActionFactory<TAuth, TPermission extends string>(
  opts: ActionFactoryOptions<TAuth, TPermission>
) {
  const audit = opts.audit ?? noopAuditWriter;
  const rateLimiter = opts.rateLimiter ?? noopRateLimiter;
  const rethrow = opts.rethrowNavigation ?? (() => {});

  function defineOrgAction<
    TInput extends z.ZodTypeAny,
    TData
  >(
    config: OrgActionConfig<TPermission, TInput>,
    handler: (
      ctx: OrgActionContext<TAuth>,
      input: TInput extends z.ZodTypeAny ? z.infer<TInput> : undefined
    ) => Promise<ActionResult<TData> | TData>
  ) {
    return async (
      orgSlug: string,
      rawInput?: unknown
    ): Promise<ActionResult<TData>> => {
      const startedAt = Date.now();
      let auth: TAuth | null = null;
      const auditOnce = async (
        outcome: "success" | "failure",
        errorCode?: string,
        errorMessage?: string
      ) => {
        if (config.audit !== true) return;
        await audit.write({
          orgId: auth ? opts.getOrgId(auth) : null,
          userId: auth ? opts.getUserId(auth) : null,
          action: config.name,
          outcome,
          durationMs: Date.now() - startedAt,
          errorCode,
          errorMessage
        });
      };

      try {
        // 1. Resolve auth (may redirect via Next.js)
        auth = await opts.resolveAuthContext(orgSlug);

        // 2. Permission gate
        if (config.permission) {
          const granted = opts.getPermissions(auth);
          if (!hasPermission(granted, config.permission as TPermission | readonly TPermission[])) {
            await auditOnce("failure", "forbidden", "Insufficient permissions");
            return fail("forbidden", "You don't have permission to perform this action.", {
              required: config.permission
            });
          }
        }

        // 3. Rate limit
        const decision = await rateLimiter.check({
          orgId: opts.getOrgId(auth),
          userId: opts.getUserId(auth),
          action: config.name
        });
        if (!decision.allowed) {
          throw rateLimitError(decision.retryAfterMs);
        }

        // 4. Validate input
        let parsed: unknown = undefined;
        if (config.input) {
          const result = config.input.safeParse(rawInput);
          if (!result.success) {
            await auditOnce("failure", "validation", "Input validation failed");
            return fail("validation", "Invalid input.", result.error.flatten());
          }
          parsed = result.data;
        }

        // 5. Run handler
        const handlerResult = await handler(
          { auth },
          parsed as TInput extends z.ZodTypeAny ? z.infer<TInput> : undefined
        );

        // Normalize return shape: handlers may return either ActionResult or raw data.
        const normalized: ActionResult<TData> = isActionResult<TData>(handlerResult)
          ? handlerResult
          : ok(handlerResult as TData);

        await auditOnce(normalized.ok ? "success" : "failure", normalized.ok ? undefined : normalized.code, normalized.ok ? undefined : normalized.error);

        return normalized;
      } catch (err) {
        // Always re-throw Next.js navigation signals.
        rethrow(err);

        if (err instanceof ActionError) {
          await auditOnce("failure", err.code, err.message);
          return fail(err.code, err.message, err.details);
        }

        opts.logger?.error?.(`[${config.name}] unexpected error`, err);
        await auditOnce("failure", "internal", err instanceof Error ? err.message : String(err));
        return fail("internal", "Something went wrong. Please try again.");
      }
    };
  }

  return { defineOrgAction };
}

function isActionResult<T>(value: unknown): value is ActionResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean" &&
    (("data" in value) || ("error" in value && "code" in value))
  );
}
