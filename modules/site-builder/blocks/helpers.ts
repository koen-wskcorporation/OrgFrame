import type { ButtonVariant, LinkValue, SiteButton } from "@/lib/links";
import { asButtonVariant, asLinkValue, createLocalId, defaultInternalLink, normalizeButtons } from "@/lib/links";
import type { CtaGridItem } from "@/modules/site-builder/types";

export function createId() {
  return createLocalId();
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function asText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

export function asBody(value: unknown, fallback: string, maxLength = 1500) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

export function asOptionalStoragePath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

export function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function asCtaItems(value: unknown, fallback: CtaGridItem[]) {
  const items = asArray(value)
    .map((raw) => {
      const item = asObject(raw);
      return {
        id: asText(item.id, createId(), 64),
        title: asText(item.title, "Learn More", 80),
        description: asBody(item.description, "", 180),
        link: asLinkValue(item.link ?? item.href, defaultInternalLink("home"))
      } satisfies CtaGridItem;
    })
    .filter((item) => item.title.trim().length > 0)
    .slice(0, 6);

  if (!items.length) {
    return fallback;
  }

  return items;
}

export function asLinkObject(value: unknown, fallback: LinkValue) {
  return asLinkValue(value, fallback);
}

export function asButtonVariantValue(value: unknown, fallback: ButtonVariant = "primary") {
  return asButtonVariant(value, fallback);
}

export function asButtons(
  value: unknown,
  fallback: SiteButton[],
  options?: {
    max?: number;
  }
) {
  const buttons = normalizeButtons(value, {
    max: options?.max ?? 6
  });

  if (buttons.length === 0) {
    return fallback;
  }

  return buttons;
}

export function asOptionalButton(value: unknown): SiteButton | null {
  const normalized = normalizeButtons(value, {
    max: 1
  });
  return normalized[0] ?? null;
}

function slugSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function sanitizePageSlug(value: string) {
  const normalized = slugSegment(value);
  return normalized || "home";
}

const reservedPageSlugs = new Set([
  "auth",
  "account",
  "api",
  "_next",
  "forbidden",
  "manage",
  "icon",
  "programs",
  "register",
  "tools"
]);

export function isReservedPageSlug(slug: string) {
  return reservedPageSlugs.has(sanitizePageSlug(slug));
}

export function defaultPageTitleFromSlug(slug: string) {
  if (slug === "home") {
    return "Home";
  }

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
