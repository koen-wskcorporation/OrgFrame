import { NextResponse, type NextRequest } from "next/server";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import {
  encryptSportsEngineToken,
  exchangeSportsEngineCodeForToken,
  getSportsEngineOauthConfig,
  verifySignedSportsEngineOauthState
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

async function resolveContext(request: NextRequest, orgSlug: string, expectedUserId: string) {
  const response = NextResponse.next();
  const supabase = createSupabaseServerForRequest(request, response);

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user || user.id !== expectedUserId) {
    return null;
  }

  const { data: org, error: orgError } = await supabase.schema("orgs").from("orgs").select("id, slug").eq("slug", orgSlug).maybeSingle();
  if (orgError || !org) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .schema("orgs").from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !membership) {
    return null;
  }

  const permissions = await resolveOrgRolePermissions(supabase, org.id, membership.role as OrgRole);
  if (!can(permissions, "org.manage.read")) {
    return null;
  }

  return {
    supabase,
    orgId: org.id as string,
    orgSlug: org.slug as string,
    userId: user.id
  };
}

export async function GET(request: NextRequest) {
  let config;
  try {
    config = getSportsEngineOauthConfig(request.nextUrl.origin);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "sportsengine_oauth_not_configured");
  }

  const state = request.nextUrl.searchParams.get("state") ?? "";
  let parsedState;
  try {
    parsedState = verifySignedSportsEngineOauthState(state, config.stateSecret);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "invalid_state");
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    const message = request.nextUrl.searchParams.get("error_description") ?? oauthError;
    return popupError(`sportsengine_oauth_error:${message}`, parsedState.origin);
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!code) {
    return popupError("oauth_code_missing", parsedState.origin);
  }

  const context = await resolveContext(request, parsedState.orgSlug, parsedState.userId);
  if (!context) {
    return popupError("forbidden", parsedState.origin);
  }

  try {
    const token = await exchangeSportsEngineCodeForToken({
      config,
      code
    });

    const expiresAt = token.expiresIn ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null;
    const { error: upsertError } = await context.supabase
      .schema("imports").from("org_platform_connections")
      .upsert(
        {
          org_id: context.orgId,
          platform_key: "sportsengine",
          status: "active",
          provider_account_id: null,
          provider_account_name: "SportsEngine",
          encrypted_access_token: encryptSportsEngineToken(token.accessToken),
          encrypted_refresh_token: token.refreshToken ? encryptSportsEngineToken(token.refreshToken) : null,
          token_type: token.tokenType,
          scope: token.scope,
          token_expires_at: expiresAt,
          connected_by_user_id: context.userId,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_error: null
        },
        { onConflict: "org_id,platform_key" }
      );

    if (upsertError) {
      throw new Error(`Failed to store SportsEngine connection: ${upsertError.message}`);
    }

    return new NextResponse(
      popupHtml(
        {
          type: "orgframe:sportsengine-oauth-connected",
          orgSlug: context.orgSlug
        },
        parsedState.origin
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "sportsengine_oauth_failed", parsedState.origin);
  }
}
