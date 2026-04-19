import { NextResponse, type NextRequest } from "next/server";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import {
  buildSportsEngineOauthDialogUrl,
  createSignedSportsEngineOauthState,
  getSportsEngineOauthConfig
} from "@/src/features/imports/integrations/sportsengine";
import type { OrgRole } from "@/src/features/core/access";

export const runtime = "nodejs";

function popupHtml(payload: Record<string, unknown>, targetOrigin = "*") {
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const safeOrigin = JSON.stringify(targetOrigin);
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>SportsEngine Connection</title></head>
  <body>
    <script>
      (function () {
        var payload = ${serializedPayload};
        var targetOrigin = ${safeOrigin};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, targetOrigin);
        }
        window.close();
      })();
    </script>
  </body>
</html>`;
}

function popupError(error: string, targetOrigin = "*") {
  return new NextResponse(
    popupHtml(
      {
        type: "orgframe:sportsengine-oauth-error",
        error
      },
      targetOrigin
    ),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

async function requireOrgManageContext(request: NextRequest) {
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
  if (!can(permissions, "org.manage.read")) {
    return { error: "FORBIDDEN", status: 403 } as const;
  }

  return { orgSlug: org.slug as string, userId: user.id } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireOrgManageContext(request);
  if ("error" in auth) {
    return popupError(auth.error ?? "forbidden", request.nextUrl.origin);
  }

  let config;
  try {
    config = getSportsEngineOauthConfig(request.nextUrl.origin);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "sportsengine_oauth_not_configured", request.nextUrl.origin);
  }

  const state = createSignedSportsEngineOauthState(
    {
      orgSlug: auth.orgSlug,
      userId: auth.userId,
      origin: request.nextUrl.origin
    },
    config.stateSecret
  );

  const url = buildSportsEngineOauthDialogUrl(config, state);
  return NextResponse.redirect(url, { status: 302 });
}
