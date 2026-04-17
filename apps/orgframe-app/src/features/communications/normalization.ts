export function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length > 11 && value?.trim().startsWith("+")) {
    return `+${digits}`;
  }
  return digits.length > 0 ? `+${digits}` : null;
}

export function normalizeDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.replace(/\s+/g, " ") : null;
}

export function splitName(value: string | null | undefined) {
  const normalized = normalizeDisplayName(value);
  if (!normalized) {
    return {
      firstName: null,
      lastName: null
    };
  }

  const parts = normalized.split(" ");
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null
  };
}

export function nameSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = (left ?? "").trim().toLowerCase();
  const b = (right ?? "").trim().toLowerCase();
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (a.includes(b) || b.includes(a)) {
    return 0.7;
  }

  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}
