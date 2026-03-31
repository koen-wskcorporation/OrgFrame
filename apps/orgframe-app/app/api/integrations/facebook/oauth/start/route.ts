import { NextResponse, type NextRequest } from "next/server";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import { buildFacebookOauthDialogUrl, createSignedFacebookOauthState, getFacebookOauthConfig } from "@/src/features/communications/integrations/facebook-oauth";
import type { OrgRole } from "@/src/features/core/access";

export const runtime = "nodejs";

async function requireCommunicationsWriteOrgContext(request: NextRequest) {
  const orgSlug = request.nextUrl.searchParams.get("orgSlug")?.trim() ?? "";
  if (!orgSlug) {
    return { error: "ORG_SLUG_REQUIRED", status: 400 } as const;
  }

  const response = NextResponse.next();
  const supabase = createSupabaseServerForRequest(request, response);

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "AUTH_REQUIRED", status: 401 } as const;
  }

  const { data: org, error: orgError } = await supabase.schema("orgs").from("orgs").select("id, slug").eq("slug", orgSlug).maybeSingle();
  if (orgError || !org) {
    return { error: "ORG_NOT_FOUND", status: 404 } as const;
  }

  const { data: membership, error: membershipError } = await supabase
    .schema("orgs").from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return { error: "FORBIDDEN", status: 403 } as const;
  }

  const permissions = await resolveOrgRolePermissions(supabase, org.id, membership.role as OrgRole);
  if (!can(permissions, "communications.write")) {
    return { error: "FORBIDDEN", status: 403 } as const;
  }

  return {
    orgSlug: org.slug,
    userId: user.id
  } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireCommunicationsWriteOrgContext(request);
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let config;
  try {
    config = getFacebookOauthConfig(request.nextUrl.origin);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "facebook_oauth_not_configured"
      },
      { status: 500 }
    );
  }

  const state = createSignedFacebookOauthState(
    {
      orgSlug: auth.orgSlug,
      userId: auth.userId,
      origin: request.nextUrl.origin
    },
    config.stateSecret
  );

  const url = buildFacebookOauthDialogUrl(config, state);
  return NextResponse.redirect(url, { status: 302 });
}
