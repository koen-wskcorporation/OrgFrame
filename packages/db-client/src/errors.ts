/**
 * Standard error codes for action failures. Stable across the wire so the UI
 * can branch on `code` instead of pattern-matching error strings.
 */
export type ActionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "validation"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

export class ActionError extends Error {
  readonly code: ActionErrorCode;
  readonly details: unknown;

  constructor(code: ActionErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ActionError";
    this.code = code;
    this.details = details;
  }
}

export type ActionResult<TData = undefined, TDetails = unknown> =
  | { ok: true; data: TData }
  | { ok: false; code: ActionErrorCode; error: string; details?: TDetails };

export function ok<TData>(data: TData): ActionResult<TData> {
  return { ok: true, data };
}

export function fail<TDetails = unknown>(
  code: ActionErrorCode,
  error: string,
  details?: TDetails
): ActionResult<never, TDetails> {
  return { ok: false, code, error, details };
}
