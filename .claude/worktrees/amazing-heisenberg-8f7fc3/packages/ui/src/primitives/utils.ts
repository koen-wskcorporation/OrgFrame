import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isSvgAssetUrl(url?: string | null) {
  if (!url) {
    return false;
  }

  const lowered = url.toLowerCase();

  if (lowered.startsWith("data:image/svg+xml")) {
    return true;
  }

  const withoutHash = lowered.split("#")[0] ?? lowered;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;

  if (withoutQuery.endsWith(".svg")) {
    return true;
  }

  if (withoutQuery.includes(".svg/") || withoutQuery.includes(".svg%2f")) {
    return true;
  }

  try {
    const decoded = decodeURIComponent(withoutQuery);
    if (decoded.endsWith(".svg") || decoded.includes(".svg/")) {
      return true;
    }
  } catch {
    // Ignore malformed URI sequences.
  }

  return false;
}
