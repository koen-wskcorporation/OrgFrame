export const SMART_IMPORT_AUTO_APPLY_THRESHOLD = 0.85;

export function shouldAutoApplyResolution(confidence: number) {
  if (!Number.isFinite(confidence)) {
    return false;
  }

  return confidence >= SMART_IMPORT_AUTO_APPLY_THRESHOLD;
}
