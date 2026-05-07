"use server";

import { z } from "zod";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { clampPanelWidth, normalizePanelKey, PANEL_KEY_MAX_LENGTH } from "@/src/features/core/preferences/types";

const updatePanelWidthSchema = z.object({
  panelKey: z.string().trim().min(1).max(PANEL_KEY_MAX_LENGTH),
  widthPx: z.number().finite()
});

type Result = { ok: true } | { ok: false; error: string };

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function updatePanelWidthPreferenceAction(input: z.input<typeof updatePanelWidthSchema>): Promise<Result> {
  const parsed = updatePanelWidthSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid panel width." };
  }

  const clamped = clampPanelWidth(parsed.data.widthPx);
  if (clamped === null) {
    return { ok: false, error: "Invalid panel width." };
  }
  const panelKey = normalizePanelKey(parsed.data.panelKey);

  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const { data: existing } = await supabase
      .schema("people")
      .from("user_preferences")
      .select("preferences_json")
      .eq("user_id", user.id)
      .maybeSingle();

    const current = asObject(existing?.preferences_json);
    const widths = asObject(current.panelWidthsPx);
    const nextWidths: Record<string, number> = {};
    for (const [key, value] of Object.entries(widths)) {
      if (typeof value === "number") nextWidths[key] = value;
    }
    nextWidths[panelKey] = clamped;
    const next = { ...current, panelWidthsPx: nextWidths };

    const { error } = await supabase
      .schema("people")
      .from("user_preferences")
      .upsert({ user_id: user.id, preferences_json: next }, { onConflict: "user_id" });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to save preference." };
  }
}
