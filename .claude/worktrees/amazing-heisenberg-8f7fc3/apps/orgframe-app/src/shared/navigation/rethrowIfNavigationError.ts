export function rethrowIfNavigationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return;
  }

  const digest = "digest" in error ? (error as { digest?: unknown }).digest : undefined;

  if (typeof digest !== "string") {
    return;
  }

  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")) {
    throw error;
  }
}
