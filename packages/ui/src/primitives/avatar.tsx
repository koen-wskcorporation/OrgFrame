import * as React from "react";
import Image from "next/image";
import { cn } from "./utils";

type AvatarProps = {
  src?: string | null;
  name?: string | null;
  alt?: string;
  sizePx: number;
  className?: string;
  priority?: boolean;
};

function initialsFor(name?: string | null) {
  if (!name) {
    return "?";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function initialsAvatarDataUri(initials: string, sizePx: number) {
  const half = sizePx / 2;
  const fontSize = Math.round(sizePx * 0.42);
  const safe = escapeXml(initials);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${sizePx}' height='${sizePx}' viewBox='0 0 ${sizePx} ${sizePx}'><rect width='${sizePx}' height='${sizePx}' rx='${half}' fill='%23e5e7eb'/><text x='${half}' y='${half}' font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='${fontSize}' font-weight='600' fill='%236b7280' text-anchor='middle' dominant-baseline='central'>${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

export function Avatar({ src, name, alt, sizePx, className, priority = false }: AvatarProps) {
  const initials = initialsFor(name);
  const resolvedAlt = alt ?? (name ? `${name} avatar` : "Avatar");
  const fallbackUri = initialsAvatarDataUri(initials, sizePx);
  const roundedStyle = { width: sizePx, height: sizePx } as const;

  if (!src) {
    return (
      <img
        alt={resolvedAlt}
        aria-hidden={alt === "" ? true : undefined}
        className={cn("shrink-0 rounded-full object-cover", className)}
        height={sizePx}
        src={fallbackUri}
        style={roundedStyle}
        width={sizePx}
      />
    );
  }

  const useBlur = sizePx >= 40;

  return (
    <Image
      alt={resolvedAlt}
      className={cn("shrink-0 rounded-full object-cover", className)}
      height={sizePx}
      priority={priority}
      src={src}
      style={roundedStyle}
      width={sizePx}
      {...(useBlur ? { placeholder: "blur" as const, blurDataURL: fallbackUri } : {})}
    />
  );
}
