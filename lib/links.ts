import { z } from "zod";

export const linkTypeValues = ["internal", "external"] as const;
export const buttonVariantValues = ["primary", "secondary", "ghost", "link"] as const;

export type LinkType = (typeof linkTypeValues)[number];
export type ButtonVariant = (typeof buttonVariantValues)[number];

export type InternalLinkValue = {
  type: "internal";
  pageSlug: string;
};

export type ExternalLinkValue = {
  type: "external";
  url: string;
};

export type LinkValue = InternalLinkValue | ExternalLinkValue;

export type ButtonConfig = {
  id: string;
  label: string;
  href: string;
  variant: ButtonVariant;
  newTab?: boolean;
};

export type SiteButton = ButtonConfig;

export type LinkPickerPageOption = {
  slug: string;
  title: string;
  isPublished: boolean;
};

export const linkValueSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("internal"),
    pageSlug: z.string().trim().min(1)
  }),
  z.object({
    type: z.literal("external"),
    url: z.string().trim().min(1)
  })
]);

export const buttonVariantSchema = z.enum(buttonVariantValues);
export const buttonConfigSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(64),
  href: z.string().trim().min(1),
  variant: buttonVariantSchema,
  newTab: z.boolean().optional()
});

const absoluteUrlPattern = /^https?:\/\//i;
const protocolPattern = /^[a-z][a-z0-9+.-]*:/i;

function isAllowedExternalValue(value: string) {
  return absoluteUrlPattern.test(value) || value.startsWith("/");
}

export function createLocalId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function defaultInternalLink(pageSlug = "home"): LinkValue {
  return {
    type: "internal",
    pageSlug
  };
}

export function defaultInternalHref(pageSlug = "home") {
  return pageSlug === "home" ? "/" : `/${pageSlug.replace(/^\/+/, "")}`;
}

export function asLinkValue(value: unknown, fallback: LinkValue = defaultInternalLink()): LinkValue {
  const parsed = linkValueSchema.safeParse(value);

  if (parsed.success) {
    if (parsed.data.type === "external" && !isAllowedExternalValue(parsed.data.url)) {
      return fallback;
    }

    return parsed.data;
  }

  // Backwards-compat support for legacy plain href strings.
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return fallback;
    }

    if (trimmed.startsWith("/")) {
      const path = trimmed.replace(/^\/+/, "");
      const segments = path.split("/").filter(Boolean);
      const pageSlug = segments.length <= 1 ? "home" : segments[1];

      return {
        type: "internal",
        pageSlug: pageSlug || "home"
      };
    }

    if (isAllowedExternalValue(trimmed)) {
      return {
        type: "external",
        url: trimmed
      };
    }
  }

  return fallback;
}

export function asButtonVariant(value: unknown, fallback: ButtonVariant = "primary"): ButtonVariant {
  const parsed = buttonVariantSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function normalizeInternalHref(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "/";
  }

  if (trimmed === "/") {
    return "/";
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");

  if (!withoutLeadingSlash) {
    return "/";
  }

  return `/${withoutLeadingSlash}`;
}

function toLegacyInternalPageSlug(href: string, orgSlug?: string) {
  const normalized = normalizeInternalHref(href);

  if (normalized === "/") {
    return "home";
  }

  const segments = normalized.replace(/^\/+/, "").split("/").filter(Boolean);

  if (!segments.length) {
    return "home";
  }

  if (orgSlug && segments[0] === orgSlug && segments.length >= 2) {
    return segments[1] ?? "home";
  }

  return segments[0] ?? "home";
}

function inferLegacyNewTab(item: Record<string, unknown>, href: string) {
  if (typeof item.newTab === "boolean") {
    return item.newTab;
  }

  const legacyLink = item.link as Record<string, unknown> | null;

  if (legacyLink && legacyLink.type === "external") {
    const url = typeof legacyLink.url === "string" ? legacyLink.url.trim() : "";
    return Boolean(url) && isExternalHref(url);
  }

  return isExternalHref(href);
}

function normalizeButtonHref(value: unknown, fallback = "/") {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return fallback;
    }

    if (isExternalHref(trimmed)) {
      return trimmed;
    }

    return normalizeInternalHref(trimmed);
  }

  const fromLinkValue = asLinkValue(value, defaultInternalLink("home"));
  return linkValueToHref(fromLinkValue);
}

function normalizeButton(input: unknown): ButtonConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const item = input as Record<string, unknown>;
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : createLocalId();
  const labelSource = typeof item.label === "string" ? item.label : item.text;

  if (typeof labelSource !== "string") {
    return null;
  }

  const label = labelSource.trim().slice(0, 64);

  if (!label) {
    return null;
  }

  const href = normalizeButtonHref(item.href ?? item.link ?? item.url, "/");

  if (!href) {
    return null;
  }

  return {
    id,
    label,
    href,
    variant: asButtonVariant(item.variant, "primary"),
    newTab: inferLegacyNewTab(item, href)
  };
}

export function normalizeButtons(
  input: unknown,
  options?: {
    max?: number;
  }
) {
  const max = options?.max ?? 6;
  const source = Array.isArray(input) ? input : [input];

  return source
    .map((item) => normalizeButton(item))
    .filter((item): item is ButtonConfig => Boolean(item))
    .slice(0, max);
}

export function resolveLinkHref(orgSlug: string, link: LinkValue) {
  if (link.type === "external") {
    return link.url;
  }

  if (link.pageSlug === "home") {
    return `/${orgSlug}`;
  }

  return `/${orgSlug}/${link.pageSlug}`;
}

export function describeLink(link: LinkValue) {
  if (link.type === "external") {
    return link.url;
  }

  return link.pageSlug === "home" ? "Home" : `/${link.pageSlug}`;
}

export function isExternalLink(link: LinkValue) {
  return link.type === "external";
}

export function isExternalHref(href: string) {
  const trimmed = href.trim();

  if (!trimmed) {
    return false;
  }

  return protocolPattern.test(trimmed) || trimmed.startsWith("//");
}

export function resolveButtonHref(orgSlug: string, href: string) {
  const trimmed = href.trim();

  if (!trimmed) {
    return `/${orgSlug}`;
  }

  if (isExternalHref(trimmed)) {
    return trimmed;
  }

  const normalized = normalizeInternalHref(trimmed);

  if (normalized === "/") {
    return `/${orgSlug}`;
  }

  if (normalized === `/${orgSlug}` || normalized.startsWith(`/${orgSlug}/`)) {
    return normalized;
  }

  return `/${orgSlug}${normalized}`;
}

export function describeButtonHref(href: string) {
  const trimmed = href.trim();

  if (!trimmed) {
    return "No link selected";
  }

  if (isExternalHref(trimmed)) {
    return trimmed;
  }

  const normalized = normalizeInternalHref(trimmed);
  return normalized === "/" ? "Home" : normalized;
}

export function linkValueToHref(link: LinkValue) {
  if (link.type === "external") {
    return link.url;
  }

  return defaultInternalHref(link.pageSlug);
}

export function hrefToLinkValue(href: string, options?: { orgSlug?: string }): LinkValue {
  const trimmed = href.trim();

  if (!trimmed) {
    return defaultInternalLink("home");
  }

  if (isExternalHref(trimmed)) {
    return {
      type: "external",
      url: trimmed
    };
  }

  return {
    type: "internal",
    pageSlug: toLegacyInternalPageSlug(trimmed, options?.orgSlug)
  };
}
