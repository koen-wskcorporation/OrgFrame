import { NextResponse, type NextRequest } from "next/server";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import {
  exchangeFacebookCodeForUserToken,
  getFacebookOauthConfig,
  listFacebookPagesForUserToken,
  verifySignedFacebookOauthState
} from "@/src/features/communications/integrations/facebook-oauth";
import type { OrgRole } from "@/src/features/core/access";

export const runtime = "nodejs";

function popupHtml(payload: Record<string, unknown>, targetOrigin = "*") {
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const safeOrigin = JSON.stringify(targetOrigin);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Facebook Connection</title>
  </head>
  <body>
    <p>Completing Facebook connection...</p>
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
        type: "orgframe:facebook-oauth-error",
        error
      },
      targetOrigin
    ),
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    }
  );
}

async function verifyUserCanWriteOrg(request: NextRequest, orgSlug: string, expectedUserId: string) {
  const response = NextResponse.next();
  const supabase = createSupabaseServerForRequest(request, response);

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== expectedUserId) {
    return false;
  }

  const { data: org, error: orgError } = await supabase.schema("orgs").from("orgs").select("id").eq("slug", orgSlug).maybeSingle();
  if (orgError || !org) {
    return false;
  }

  const { data: membership, error: membershipError } = await supabase
    .schema("orgs").from("org_memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return false;
  }

  const permissions = await resolveOrgRolePermissions(supabase, org.id, membership.role as OrgRole);
  return can(permissions, "communications.write");
}

export async function GET(request: NextRequest) {
  let config;
  try {
    config = getFacebookOauthConfig(request.nextUrl.origin);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "facebook_oauth_not_configured");
  }

  const state = request.nextUrl.searchParams.get("state") ?? "";
  let parsedState;
  try {
    parsedState = verifySignedFacebookOauthState(state, config.stateSecret);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "invalid_state");
  }

  const facebookError = request.nextUrl.searchParams.get("error");
  if (facebookError) {
    const message = request.nextUrl.searchParams.get("error_description") ?? facebookError;
    return popupError(`facebook_oauth_error:${message}`, parsedState.origin);
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!code) {
    return popupError("oauth_code_missing", parsedState.origin);
  }

  const hasOrgWrite = await verifyUserCanWriteOrg(request, parsedState.orgSlug, parsedState.userId);
  if (!hasOrgWrite) {
    return popupError("forbidden", parsedState.origin);
  }

  try {
    const userToken = await exchangeFacebookCodeForUserToken({
      config,
      code
    });

    const pages = await listFacebookPagesForUserToken({
      userAccessToken: userToken.accessToken
    });

    return new NextResponse(
      popupHtml(
        {
          type: "orgframe:facebook-oauth-pages",
          orgSlug: parsedState.orgSlug,
          pages
        },
        parsedState.origin
      ),
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      }
    );
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "facebook_oauth_failed", parsedState.origin);
  }
}
