import { ActionError } from "./errors";

/**
 * Generic permission helpers parameterised over the consumer's `Permission`
 * union — the package stays app-agnostic.
 */
export function hasPermission<P extends string>(
  granted: readonly P[],
  required: P | readonly P[]
): boolean {
  const list = Array.isArray(required) ? required : [required as P];
  for (const p of list) {
    if (!granted.includes(p)) return false;
  }
  return true;
}

export function requirePermission<P extends string>(
  granted: readonly P[],
  required: P | readonly P[]
): void {
  if (!hasPermission(granted, required)) {
    throw new ActionError("forbidden", "Insufficient permissions", { required });
  }
}
