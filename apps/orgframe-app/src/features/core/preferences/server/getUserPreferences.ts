import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSessionUser, type SessionUser } from "@/src/features/core/auth/server/getSessionUser";
import type { UserPreferences } from "@/src/features/core/preferences/types";
import { clampPanelWidth, normalizePanelKey } from "@/src/features/core/preferences/types";

type Options = {
  sessionUser?: SessionUser | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function getUserPreferences(options?: Options): Promise<UserPreferences> {
  try {
    const sessionUser = options?.sessionUser ?? (await getSessionUser());
    if (!sessionUser) return {};

    const supabase = await createSupabaseServer();
    const { data, error } = await supabase
      .schema("people")
      .from("user_preferences")
      .select("preferences_json")
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (error || !data) return {};

    const raw = asObject(data.preferences_json);
    const prefs: UserPreferences = {};

    const widthsRaw = asObject(raw.panelWidthsPx);
    const panelWidthsPx: Record<string, number> = {};
    for (const [key, value] of Object.entries(widthsRaw)) {
      if (typeof value !== "number") continue;
      const clamped = clampPanelWidth(value);
      if (clamped === null) continue;
      panelWidthsPx[normalizePanelKey(key)] = clamped;
    }
    if (Object.keys(panelWidthsPx).length > 0) {
      prefs.panelWidthsPx = panelWidthsPx;
    }
    return prefs;
  } catch {
    return {};
  }
}
