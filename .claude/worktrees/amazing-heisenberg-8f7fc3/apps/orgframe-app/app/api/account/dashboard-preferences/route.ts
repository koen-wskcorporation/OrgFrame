import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { normalizeDashboardUserPreferences, parseDashboardUserPreferencesPayload, serializeDashboardUserPreferences } from "@/src/features/core/dashboard/preferences";

async function listUserOrgIds(userId: string) {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .schema("orgs")
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);

  return (data ?? [])
    .map((row: any) => (typeof row.org_id === "string" ? row.org_id : null))
    .filter((value: string | null): value is string => Boolean(value));
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const [supabase, orgIds] = await Promise.all([createSupabaseServer(), listUserOrgIds(sessionUser.id)]);
  const { data } = await supabase
    .schema("people")
    .from("user_dashboard_preferences")
    .select("config_json")
    .eq("user_id", sessionUser.id)
    .maybeSingle();

  const preferences = normalizeDashboardUserPreferences(data?.config_json ?? {}, orgIds);

  return NextResponse.json(
    {
      authenticated: true,
      preferences
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function PATCH(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ authenticated: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ authenticated: true, error: "Invalid JSON body." }, { status: 400 });
  }

  const orgIds = await listUserOrgIds(sessionUser.id);
  const preferences = parseDashboardUserPreferencesPayload((payload as { preferences?: unknown })?.preferences ?? {}, orgIds);
  const serialized = serializeDashboardUserPreferences(preferences);

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("people")
    .from("user_dashboard_preferences")
    .upsert(
      {
        user_id: sessionUser.id,
        config_json: serialized
      },
      {
        onConflict: "user_id"
      }
    );

  if (error) {
    return NextResponse.json({ authenticated: true, error: "Unable to save preferences." }, { status: 500 });
  }

  return NextResponse.json({ authenticated: true, preferences: serialized });
}
