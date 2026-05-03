"use client";

import * as React from "react";
import type { UserPreferences } from "@/src/features/core/preferences/types";

const PANEL_WIDTH_STORAGE_PREFIX = "orgframe:panel-width-px:";

type ContextValue = {
  preferences: UserPreferences;
};

const UserPreferencesContext = React.createContext<ContextValue>({ preferences: {} });

export function UserPreferencesProvider({
  initialPreferences,
  children
}: {
  initialPreferences: UserPreferences;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const widths = initialPreferences.panelWidthsPx;
    if (!widths) return;
    try {
      for (const [key, value] of Object.entries(widths)) {
        if (typeof value === "number") {
          window.localStorage.setItem(`${PANEL_WIDTH_STORAGE_PREFIX}${key}`, String(value));
        }
      }
    } catch {
      /* ignore */
    }
  }, [initialPreferences.panelWidthsPx]);

  const value = React.useMemo<ContextValue>(() => ({ preferences: initialPreferences }), [initialPreferences]);
  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  return React.useContext(UserPreferencesContext).preferences;
}
