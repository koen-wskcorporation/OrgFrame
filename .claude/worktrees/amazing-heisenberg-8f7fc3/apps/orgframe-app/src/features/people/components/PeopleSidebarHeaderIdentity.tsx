"use client";

import type { ReactNode } from "react";
import { cn } from "@orgframe/ui/primitives/utils";

type PeopleSidebarHeaderIdentityProps = {
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  leadingAction?: ReactNode;
  className?: string;
};

function initialsFor(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "??";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "??";
}

export function PeopleSidebarHeaderIdentity({ name, subtitle, avatarUrl, leadingAction, className }: PeopleSidebarHeaderIdentityProps) {
  const initials = initialsFor(name);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {leadingAction ? <div className="w-full">{leadingAction}</div> : null}
      <div className="flex min-w-0 items-center gap-2.5">
        {avatarUrl ? (
          <img alt={`${name} avatar`} className="h-8 w-8 shrink-0 rounded-full border object-cover" src={avatarUrl} />
        ) : (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface-muted text-xs font-semibold text-text-muted">
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight text-text">{name}</p>
          {subtitle ? <p className="truncate text-xs text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
