"use server";

import { isValidHexColor } from "@/lib/branding/applyBrandingVars";
import { isReservedOrgSlug } from "@/lib/org/reservedSlugs";
import { isKnownOrgSize, isKnownOrgType, normalizeActivitySelections, normalizeOrgSlug } from "@/lib/org/onboarding";
import { createSupabaseServer } from "@/lib/supabase/server";

const orgSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanValue(value: string) {
  return value.trim();
}

function isRpcMessage(error: unknown, code: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? error.message : null;
  return typeof message === "string" && message.includes(code);
}

export type CreateOrganizationActionResult =
  | {
      ok: true;
      orgSlug: string;
    }
  | {
      ok: false;
      code:
        | "auth_required"
        | "org_name_invalid"
        | "org_type_invalid"
        | "org_activities_invalid"
        | "theme_color_invalid"
        | "org_size_invalid"
        | "org_slug_invalid"
        | "org_slug_reserved"
        | "org_slug_taken"
        | "org_create_unavailable"
        | "org_create_failed";
      error: string;
    };

function buildSlugCandidates(baseSlug: string, explicitSlugProvided: boolean) {
  if (explicitSlugProvided) {
    return [baseSlug];
  }

  return Array.from({ length: 20 }, (_, index) => {
    if (index === 0) {
      return baseSlug;
    }

    return `${baseSlug}-${index + 1}`;
  });
}

function toRpcFailure(error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }): CreateOrganizationActionResult {
  console.error("createOrganizationAction: RPC failed", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint
  });

  if (
    error.code === "42883" ||
    error.code === "42P01" ||
    error.code === "42704" ||
    error.code === "42501" ||
    error.code === "42702" ||
    error.code === "PGRST202"
  ) {
    return {
      ok: false,
      code: "org_create_unavailable",
      error: "Organization creation is not available yet. Run the latest database migrations and try again."
    };
  }

  if (error.code === "23505") {
    return {
      ok: false,
      code: "org_slug_taken",
      error: "That URL slug is already in use."
    };
  }

  if (isRpcMessage(error, "ORG_NAME_INVALID")) {
    return {
      ok: false,
      code: "org_name_invalid",
      error: "Enter an organization name between 2 and 120 characters."
    };
  }

  if (isRpcMessage(error, "ORG_SLUG_RESERVED")) {
    return {
      ok: false,
      code: "org_slug_reserved",
      error: "That URL slug is reserved by the system."
    };
  }

  if (isRpcMessage(error, "ORG_SLUG_INVALID")) {
    return {
      ok: false,
      code: "org_slug_invalid",
      error: "Use a URL slug with letters, numbers, and hyphens only."
    };
  }

  return {
    ok: false,
    code: "org_create_failed",
    error: `Unable to create organization right now. Please try again. ${error.code ? `(ref: ${error.code})` : ""}`.trim()
  };
}

export async function createOrganizationAction(input: {
  orgName: string;
  orgSlug?: string;
  orgType: string;
  activityLabels: string[];
  themeColor: string;
  orgSize?: string | null;
}): Promise<CreateOrganizationActionResult> {
  const orgName = cleanValue(input.orgName);
  const rawSlug = cleanValue(input.orgSlug ?? "");
  const slugInput = rawSlug || orgName;
  const normalizedSlug = normalizeOrgSlug(slugInput);
  const orgType = cleanValue(input.orgType);
  const activityLabels = normalizeActivitySelections(input.activityLabels);
  const themeColor = cleanValue(input.themeColor).toLowerCase();
  const orgSize = cleanValue(input.orgSize ?? "");
  const explicitSlugProvided = rawSlug.length > 0;

  if (orgName.length < 2 || orgName.length > 120) {
    return {
      ok: false,
      code: "org_name_invalid",
      error: "Enter an organization name between 2 and 120 characters."
    };
  }

  if (!isKnownOrgType(orgType)) {
    return {
      ok: false,
      code: "org_type_invalid",
      error: "Choose the organization type that fits best."
    };
  }

  if (activityLabels.length === 0) {
    return {
      ok: false,
      code: "org_activities_invalid",
      error: "Choose at least one sport or activity."
    };
  }

  if (!isValidHexColor(themeColor)) {
    return {
      ok: false,
      code: "theme_color_invalid",
      error: "Choose a valid theme color to continue."
    };
  }

  if (orgSize && !isKnownOrgSize(orgSize)) {
    return {
      ok: false,
      code: "org_size_invalid",
      error: "Choose a valid organization size or leave it blank."
    };
  }

  if (!normalizedSlug || normalizedSlug.length < 2 || normalizedSlug.length > 60 || !orgSlugPattern.test(normalizedSlug)) {
    return {
      ok: false,
      code: "org_slug_invalid",
      error: "Use a URL slug with letters, numbers, and hyphens only."
    };
  }

  if (isReservedOrgSlug(normalizedSlug)) {
    return {
      ok: false,
      code: "org_slug_reserved",
      error: "That URL slug is reserved by the system."
    };
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      code: "auth_required",
      error: "Please sign in and try again."
    };
  }

  const candidateSlugs = buildSlugCandidates(normalizedSlug, explicitSlugProvided);

  for (const candidateSlug of candidateSlugs) {
    const { data, error } = await supabase.rpc("create_org_for_current_user", {
      input_org_name: orgName,
      input_org_slug: candidateSlug,
      input_org_type: orgType,
      input_activity_labels: activityLabels,
      input_brand_primary: themeColor,
      input_org_size: orgSize || null
    });

    if (error) {
      if (!explicitSlugProvided && error.code === "23505") {
        continue;
      }

      return toRpcFailure(error);
    }

    const created = Array.isArray(data) ? data[0] : data;
    const createdSlug =
      created && typeof created === "object" && "org_slug" in created && typeof created.org_slug === "string" ? created.org_slug : candidateSlug;

    return {
      ok: true,
      orgSlug: createdSlug
    };
  }

  return {
    ok: false,
    code: "org_slug_taken",
    error: "That organization URL is busy right now. Try a slightly different name."
  };
}
