"use client";

import * as React from "react";
import { cn, isSvgAssetUrl } from "./utils";

type AdaptiveLogoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  svgClassName?: string;
};

const COLOR_ATTRS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"] as const;
const svgSourceCache = new Map<string, string | null>();

function parseHexColor(value: string) {
  const hex = value.replace("#", "").trim();

  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
    const g = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
    const b = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
    const a = hex.length === 4 ? Number.parseInt(`${hex[3]}${hex[3]}`, 16) : 255;
    return { r, g, b, a };
  }

  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255;
    return { r, g, b, a };
  }

  return null;
}

function parseRgbChannel(raw: string) {
  const value = raw.trim();
  if (value.endsWith("%")) {
    const percent = Number.parseFloat(value.slice(0, -1));
    if (Number.isNaN(percent)) {
      return null;
    }
    return Math.round((Math.max(0, Math.min(100, percent)) / 100) * 255);
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.round(Math.max(0, Math.min(255, parsed)));
}

function parseRgbColor(value: string) {
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) {
    return null;
  }

  const parts = match[1].split(",");
  if (parts.length < 3) {
    return null;
  }

  const r = parseRgbChannel(parts[0] ?? "");
  const g = parseRgbChannel(parts[1] ?? "");
  const b = parseRgbChannel(parts[2] ?? "");
  if (r === null || g === null || b === null) {
    return null;
  }

  let a = 255;
  if (parts.length >= 4) {
    const alphaRaw = parts[3]?.trim() ?? "1";
    const alpha = alphaRaw.endsWith("%") ? Number.parseFloat(alphaRaw.slice(0, -1)) / 100 : Number.parseFloat(alphaRaw);
    if (!Number.isNaN(alpha)) {
      a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }

  return { r, g, b, a };
}

function normalizeThemeColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "none" || lowered === "transparent" || lowered === "currentcolor" || lowered.startsWith("url(")) {
    return null;
  }

  if (lowered === "black") {
    return "var(--adaptive-logo-black)";
  }
  if (lowered === "white") {
    return "var(--adaptive-logo-white)";
  }

  if (lowered.startsWith("#")) {
    const parsed = parseHexColor(lowered);
    if (!parsed || parsed.a === 0) {
      return null;
    }
    if (parsed.r === 0 && parsed.g === 0 && parsed.b === 0) {
      return "var(--adaptive-logo-black)";
    }
    if (parsed.r === 255 && parsed.g === 255 && parsed.b === 255) {
      return "var(--adaptive-logo-white)";
    }
    return null;
  }

  if (lowered.startsWith("rgb")) {
    const parsed = parseRgbColor(lowered);
    if (!parsed || parsed.a === 0) {
      return null;
    }
    if (parsed.r === 0 && parsed.g === 0 && parsed.b === 0) {
      return "var(--adaptive-logo-black)";
    }
    if (parsed.r === 255 && parsed.g === 255 && parsed.b === 255) {
      return "var(--adaptive-logo-white)";
    }
  }

  return null;
}

function rewriteStyleValue(rawStyle: string) {
  const declarations = rawStyle
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean);

  if (declarations.length === 0) {
    return rawStyle;
  }

  let changed = false;
  const rewritten = declarations.map((declaration) => {
    const colonIndex = declaration.indexOf(":");
    if (colonIndex < 1) {
      return declaration;
    }

    const prop = declaration.slice(0, colonIndex).trim().toLowerCase();
    const value = declaration.slice(colonIndex + 1).trim();
    if (!COLOR_ATTRS.includes(prop as (typeof COLOR_ATTRS)[number])) {
      return declaration;
    }

    const replacement = normalizeThemeColor(value);
    if (!replacement) {
      return declaration;
    }

    changed = true;
    return `${prop}: ${replacement}`;
  });

  return changed ? rewritten.join("; ") : rawStyle;
}

function transformSvg(raw: string, svgClassName?: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "image/svg+xml");
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg") {
    return null;
  }

  doc.querySelectorAll("script,foreignObject").forEach((node) => node.remove());

  doc.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attr.name);
      }
    });

    COLOR_ATTRS.forEach((attr) => {
      const current = element.getAttribute(attr);
      if (!current) {
        return;
      }

      const replacement = normalizeThemeColor(current);
      if (replacement) {
        element.setAttribute(attr, replacement);
      }
    });

    const style = element.getAttribute("style");
    if (style) {
      element.setAttribute("style", rewriteStyleValue(style));
    }
  });

  if (svgClassName) {
    svg.setAttribute("class", svgClassName);
  }
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  return new XMLSerializer().serializeToString(svg);
}

export function AdaptiveLogo({ alt, className, src, svgClassName = "block h-full w-auto max-w-full object-contain", ...imgProps }: AdaptiveLogoProps) {
  const [svgSource, setSvgSource] = React.useState<string | null>(null);
  const isSvg = isSvgAssetUrl(src);
  const { height, style, width } = imgProps;

  React.useEffect(() => {
    if (!isSvg) {
      setSvgSource(null);
      return;
    }

    const cached = svgSourceCache.get(src);
    if (cached !== undefined) {
      setSvgSource(cached);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(src, {
          cache: "force-cache",
          signal: controller.signal
        });

        if (!response.ok) {
          svgSourceCache.set(src, null);
          setSvgSource(null);
          return;
        }

        const raw = await response.text();
        svgSourceCache.set(src, raw);
        setSvgSource(raw);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        svgSourceCache.set(src, null);
        setSvgSource(null);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isSvg, src]);

  const inlineSvg = React.useMemo(() => {
    if (!svgSource) {
      return null;
    }
    return transformSvg(svgSource, svgClassName);
  }, [svgClassName, svgSource]);

  if (isSvg && inlineSvg) {
    const inlineStyle: React.CSSProperties = {
      ...style
    };
    if (width !== undefined) {
      inlineStyle.width = typeof width === "number" ? `${width}px` : width;
    }
    if (height !== undefined) {
      inlineStyle.height = typeof height === "number" ? `${height}px` : height;
    }

    return (
      <span
        aria-hidden={alt ? undefined : true}
        aria-label={alt || undefined}
        className={cn("[--adaptive-logo-black:#000] [--adaptive-logo-white:#fff] dark:[--adaptive-logo-black:#fff] dark:[--adaptive-logo-white:#000]", className)}
        role={alt ? "img" : undefined}
        style={inlineStyle}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={className} src={src} {...imgProps} />;
}
