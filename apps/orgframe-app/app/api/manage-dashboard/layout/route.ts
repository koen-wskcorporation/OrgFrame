import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { loadDashboardLayout, saveDashboardLayout } from "@/src/features/manage-dashboard/layout-storage";
import { dashboardLayoutSchema, normalizeDashboardLayout } from "@/src/features/manage-dashboard/types";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function resolveContext(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { kind: "unauth" as const };
  const url = new URL(request.url);
  const orgSlug = url.searchParams.get("orgSlug");
  if (!orgSlug) return { kind: "bad-request" as const, message: "Missing orgSlug" };
  try {
    const orgContext = await getOrgAuthContext(orgSlug);
    return { kind: "ok" as const, userId: sessionUser.id, orgId: orgContext.orgId };
  } catch {
    return { kind: "forbidden" as const };
  }
}

export async function GET(request: Request) {
  const ctx = await resolveContext(request);
  if (ctx.kind === "unauth") return unauthorized();
  if (ctx.kind === "bad-request") return NextResponse.json({ error: ctx.message }, { status: 400 });
  if (ctx.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const layout = await loadDashboardLayout({ userId: ctx.userId, orgId: ctx.orgId });
  return NextResponse.json({ layout }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const ctx = await resolveContext(request);
  if (ctx.kind === "unauth") return unauthorized();
  if (ctx.kind === "bad-request") return NextResponse.json({ error: ctx.message }, { status: 400 });
  if (ctx.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = dashboardLayoutSchema.safeParse((body as { layout?: unknown })?.layout ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }
  const normalized = normalizeDashboardLayout(parsed.data);

  try {
    const saved = await saveDashboardLayout({ userId: ctx.userId, orgId: ctx.orgId, layout: normalized });
    return NextResponse.json({ layout: saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Save failed" }, { status: 500 });
  }
}
