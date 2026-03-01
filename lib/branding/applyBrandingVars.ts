import type { CSSProperties } from "react";

type BrandingColorInput = {
  accent?: string | null;
};

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function normalizeHex(value: string) {
  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const raw = match[1];

  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }

  return `#${raw.toLowerCase()}`;
}

function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);

  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function hexToHslComponents(hex: string) {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return null;
  }

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h = Math.round(h * 60);

    if (h < 0) {
      h += 360;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function isLightColor(hex: string) {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return true;
  }

  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.5;
}

export function applyBrandingVars({ accent }: BrandingColorInput): CSSProperties {
  const styleVars: Record<string, string> = {};

  if (!accent) {
    return styleVars as CSSProperties;
  }

  const normalized = normalizeHex(accent);
  const accentHsl = normalized ? hexToHslComponents(normalized) : null;

  if (!normalized || !accentHsl) {
    return styleVars as CSSProperties;
  }

  styleVars["--accent"] = accentHsl;
  styleVars["--ring"] = accentHsl;
  styleVars["--accent-foreground"] = isLightColor(normalized) ? "220 35% 10%" : "0 0% 100%";

  return styleVars as CSSProperties;
}

export function isValidHexColor(value: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
