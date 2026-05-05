"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./utils";

export type BreadcrumbItem = {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
};

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
  /** Optional leading element (e.g. a Home button rendered before the first item). */
  leading?: React.ReactNode;
  className?: string;
  /** Maximum chars per label before truncating mid-segment. Defaults to 28. */
  maxSegmentChars?: number;
};

export function Breadcrumb({ items, leading, className, maxSegmentChars = 28 }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-0.5 text-sm text-text-muted", className)}>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const showSeparator = leading || index > 0;
        const interactive = !isLast && Boolean(item.onClick);
        const labelText = typeof item.label === "string" ? item.label : null;
        const truncated = labelText && labelText.length > maxSegmentChars
          ? `${labelText.slice(0, maxSegmentChars - 1)}…`
          : null;

        const content = (
          <>
            {item.icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span> : null}
            <span className="truncate" title={truncated ? labelText ?? undefined : undefined}>
              {truncated ?? item.label}
            </span>
          </>
        );

        return (
          <React.Fragment key={item.id}>
            {showSeparator ? (
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted/60" />
            ) : null}
            {interactive ? (
              <button
                className="flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={item.onClick}
                type="button"
              >
                {content}
              </button>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn(
                  "flex min-w-0 max-w-[20rem] items-center gap-1.5 px-1.5 py-1",
                  isLast ? "font-medium text-text" : null
                )}
              >
                {content}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
