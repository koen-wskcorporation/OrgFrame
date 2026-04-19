import * as React from "react";
import { cn } from "./utils";

type PersonChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  name: string;
  avatarUrl?: string | null;
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

export function PersonChip({ avatarUrl, className, name, ...props }: PersonChipProps) {
  const initials = initialsFor(name);

  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-full border bg-surface-muted/40 px-2 py-1", className)} {...props}>
      {avatarUrl ? (
        <img alt={`${name} avatar`} className="h-5 w-5 rounded-full border object-cover" src={avatarUrl} />
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-surface text-[10px] font-semibold text-text-muted">{initials}</span>
      )}
      <span className="truncate text-xs font-medium text-text">{name}</span>
    </span>
  );
}
