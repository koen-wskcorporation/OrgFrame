import { NextResponse, type NextRequest } from "next/server";
import { isReservedOrgSlug } from "@/lib/org/reservedSlugs";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isReservedPageSlug } from "@/modules/site-builder/blocks/helpers";

type SlugKind = "org" | "page" | "program" | "form";

type SlugAvailabilityRequest = {
  kind: SlugKind;
  slug: string;
  orgSlug?: string;
  currentSlug?: string;
};

type SlugAvailabilityResponse = {
  ok: true;
  kind: SlugKind;
  normalizedSlug: string;
  available: boolean;
  message: string | null;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function asSuccess(payload: Omit<SlugAvailabilityResponse, "ok">) {
  return NextResponse.json({
    ok: true,
    ...payload
  } satisfies SlugAvailabilityResponse);
}

function asBadRequest(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: message
    },
    {
      status: 400
    }
  );
}

function isValidPayload(value: unknown): value is SlugAvailabilityRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<SlugAvailabilityRequest>;
  return (payload.kind === "org" || payload.kind === "page" || payload.kind === "program" || payload.kind === "form") && typeof payload.slug === "string";
}

function validateSlugFormat(kind: SlugKind, normalizedSlug: string) {
  if (!normalizedSlug) {
    return {
      available: false,
      message: "Slug is required."
    };
  }

  if (normalizedSlug.length < 2 || normalizedSlug.length > 60 || !slugPattern.test(normalizedSlug)) {
    return {
      available: false,
      message: "Use 2-60 characters with lowercase letters, numbers, and hyphens."
    };
  }

  if (kind === "org" && isReservedOrgSlug(normalizedSlug)) {
    return {
      available: false,
      message: "That organization slug is reserved."
    };
  }

  if (kind === "page" && normalizedSlug !== "home" && isReservedPageSlug(normalizedSlug)) {
    return {
      available: false,
      message: "That page URL is reserved by the system."
    };
  }

  return {
    available: true,
    message: null
  };
}

async function orgSlugExists(slug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("orgs").select("id").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function resolveOrgIdBySlug(orgSlug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("orgs").select("id").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function pageSlugExists(orgId: string, slug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_pages").select("id").eq("org_id", orgId).eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function programSlugExists(orgId: string, slug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("programs").select("id").eq("org_id", orgId).eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function formSlugExists(orgId: string, slug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_forms").select("id").eq("org_id", orgId).eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

export async function POST(request: NextRequest) {
  const payloadRaw = await request.json().catch(() => null);

  if (!isValidPayload(payloadRaw)) {
    return asBadRequest("Invalid slug check request.");
  }

  const payload = payloadRaw;
  const normalizedSlug = normalizeSlug(payload.slug);
  const normalizedCurrentSlug = typeof payload.currentSlug === "string" ? normalizeSlug(payload.currentSlug) : "";

  if (normalizedCurrentSlug && normalizedSlug === normalizedCurrentSlug) {
    return asSuccess({
      kind: payload.kind,
      normalizedSlug,
      available: true,
      message: "Using current slug."
    });
  }

  const formatValidation = validateSlugFormat(payload.kind, normalizedSlug);

  if (!formatValidation.available) {
    return asSuccess({
      kind: payload.kind,
      normalizedSlug,
      available: false,
      message: formatValidation.message
    });
  }

  try {
    if (payload.kind === "org") {
      const exists = await orgSlugExists(normalizedSlug);
      return asSuccess({
        kind: payload.kind,
        normalizedSlug,
        available: !exists,
        message: exists ? "That organization slug already exists." : "Slug is available."
      });
    }

    const normalizedOrgSlug = typeof payload.orgSlug === "string" ? normalizeSlug(payload.orgSlug) : "";

    if (!normalizedOrgSlug) {
      return asBadRequest("Organization slug is required for scoped checks.");
    }

    const orgId = await resolveOrgIdBySlug(normalizedOrgSlug);

    if (!orgId) {
      return asSuccess({
        kind: payload.kind,
        normalizedSlug,
        available: false,
        message: "Organization not found."
      });
    }

    if (payload.kind === "page") {
      const exists = await pageSlugExists(orgId, normalizedSlug);
      return asSuccess({
        kind: payload.kind,
        normalizedSlug,
        available: !exists,
        message: exists ? "That page URL already exists in this organization." : "Page URL is available."
      });
    }

    if (payload.kind === "program") {
      const exists = await programSlugExists(orgId, normalizedSlug);
      return asSuccess({
        kind: payload.kind,
        normalizedSlug,
        available: !exists,
        message: exists ? "That program slug already exists in this organization." : "Program slug is available."
      });
    }

    const exists = await formSlugExists(orgId, normalizedSlug);
    return asSuccess({
      kind: payload.kind,
      normalizedSlug,
      available: !exists,
      message: exists ? "That form slug already exists in this organization." : "Form slug is available."
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to check slug availability right now."
      },
      {
        status: 500
      }
    );
  }
}
