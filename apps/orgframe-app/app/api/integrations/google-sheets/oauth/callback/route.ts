import { NextResponse, type NextRequest } from "next/server";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import {
  exchangeGoogleSheetsCodeForUserToken,
  getGoogleSheetsOauthConfig,
  verifySignedGoogleSheetsOauthState
} from "@/src/features/forms/integrations/google-sheets/oauth";
import { connectFormToGoogleSheet, runGoogleSheetSyncForForm } from "@/src/features/forms/integrations/google-sheets/sync";
import type { OrgRole } from "@/src/features/core/access";

export const runtime = "nodejs";

type ConnectContext = {
  orgId: string;
  orgSlug: string;
  formId: string;
  formName: string;
  formKind: "generic" | "program_registration";
  userId: string;
  userEmail: string | null;
};

function popupHtml(payload: Record<string, unknown>, targetOrigin = "*") {
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const safeOrigin = JSON.stringify(targetOrigin);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google Sheets Connection</title>
  </head>
  <body>
    <p>Completing Google Sheets connection...</p>
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
        type: "orgframe:google-sheets-oauth-error",
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

async function resolveConnectContext(request: NextRequest, orgSlug: string, formId: string, expectedUserId: string): Promise<ConnectContext | null> {
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
  if (!can(permissions, "forms.write")) {
    return null;
  }

  const { data: form, error: formError } = await supabase
    .schema("forms").from("org_forms")
    .select("id, name, form_kind")
    .eq("org_id", org.id)
    .eq("id", formId)
    .maybeSingle();
  if (formError || !form) {
    return null;
  }

  const formKind = String(form.form_kind ?? "").trim();
  if (formKind !== "generic" && formKind !== "program_registration") {
    return null;
  }

  const formName = String(form.name ?? "").trim() || "Form";

  return {
    orgId: org.id as string,
    orgSlug: org.slug as string,
    formId,
    formName,
    formKind,
    userId: user.id,
    userEmail: user.email ?? null
  };
}

export async function GET(request: NextRequest) {
  let config;
  try {
    config = getGoogleSheetsOauthConfig(request.nextUrl.origin);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "google_sheets_oauth_not_configured");
  }

  const state = request.nextUrl.searchParams.get("state") ?? "";
  let parsedState;
  try {
    parsedState = verifySignedGoogleSheetsOauthState(state, config.stateSecret);
  } catch (error) {
    return popupError(error instanceof Error ? error.message : "invalid_state");
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    const message = request.nextUrl.searchParams.get("error_description") ?? oauthError;
    return popupError(`google_oauth_error:${message}`, parsedState.origin);
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!code) {
    return popupError("oauth_code_missing", parsedState.origin);
  }

  const context = await resolveConnectContext(request, parsedState.orgSlug, parsedState.formId, parsedState.userId);
  if (!context) {
    return popupError("forbidden", parsedState.origin);
  }

  try {
    const userToken = await exchangeGoogleSheetsCodeForUserToken({
      config,
      code
    });

    const connected = await connectFormToGoogleSheet({
      orgId: context.orgId,
      formId: context.formId,
      formName: context.formName,
      formKind: context.formKind,
      createdByUserId: context.userId,
      shareWithEmail: context.userEmail,
      ownerAccessToken: userToken.accessToken
    });

    try {
      await runGoogleSheetSyncForForm({
        orgId: context.orgId,
        formId: context.formId,
        trigger: "manual",
        allowInbound: true,
        allowOutbound: true
      });
    } catch {
      // Integration row still exists. UI reads latest error from sync status.
    }

    return new NextResponse(
      popupHtml(
        {
          type: "orgframe:google-sheets-connected",
          orgSlug: context.orgSlug,
          formId: context.formId,
          spreadsheetUrl: connected.spreadsheetUrl
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
    return popupError(error instanceof Error ? error.message : "google_sheets_oauth_failed", parsedState.origin);
  }
}
