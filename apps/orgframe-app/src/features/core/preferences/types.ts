export type UserPreferences = {
  panelWidthsPx?: Record<string, number>;
};

export const PANEL_WIDTH_MIN = 280;
export const PANEL_WIDTH_MAX = 900;
export const PANEL_KEY_MAX_LENGTH = 120;

export function clampPanelWidth(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, Math.round(value)));
}

export function normalizePanelKey(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (trimmed.length === 0) return "default";
  return trimmed.slice(0, PANEL_KEY_MAX_LENGTH);
}
