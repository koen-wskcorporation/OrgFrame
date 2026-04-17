"use client";

import * as React from "react";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeModeContextValue = {
  mode: ThemeMode;
  resolvedMode: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const THEME_MODE_STORAGE_KEY = "orgframe.theme.mode";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const ThemeModeContext = React.createContext<ThemeModeContextValue | null>(null);

function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "dark") {
    return "dark";
  }
  if (mode === "light") {
    return "light";
  }
  return systemPrefersDark ? "dark" : "light";
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

function getStoredThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (value === "auto" || value === "light" || value === "dark") {
      return value;
    }
  } catch {
    // Ignore localStorage read failures.
  }

  return null;
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<ThemeMode>(() => getStoredThemeMode() ?? "auto");
  const [systemPrefersDark, setSystemPrefersDark] = React.useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(THEME_MEDIA_QUERY).matches;
  });

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const updatePreference = () => {
      setSystemPrefersDark(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  const resolvedMode = React.useMemo(() => resolveTheme(mode, systemPrefersDark), [mode, systemPrefersDark]);

  React.useLayoutEffect(() => {
    applyResolvedTheme(resolvedMode);
  }, [resolvedMode]);

  const handleSetMode = React.useCallback((nextMode: ThemeMode) => {
    setMode(nextMode);
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Ignore localStorage write failures.
    }
  }, []);

  const value = React.useMemo<ThemeModeContextValue>(
    () => ({
      mode,
      resolvedMode,
      setMode: handleSetMode
    }),
    [handleSetMode, mode, resolvedMode]
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const context = React.useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeModeProvider.");
  }
  return context;
}
