import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { widgetTypes, type WidgetType } from "@/src/features/manage-dashboard/types";
import { loadWidgetData } from "@/src/features/manage-dashboard/widgets/server-loaders";

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const url = new URL(request.url);
  const orgSlug = url.searchParams.get("orgSlug");
  const type = url.searchParams.get("type");
  if (!orgSlug || !type || !(widgetTypes as readonly string[]).includes(type)) {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  let orgContext;
  try {
    orgContext = await getOrgAuthContext(orgSlug);
  } catch {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const data = await loadWidgetData(type as WidgetType, {
    orgId: orgContext.orgId,
    orgSlug: orgContext.orgSlug,
    permissions: orgContext.membershipPermissions
  });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
