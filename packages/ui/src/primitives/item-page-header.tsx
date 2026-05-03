"use client";

import * as React from "react";
import { cn } from "./utils";
import { usePageHeaderMeasure } from "./page-header-measure";

type ItemPageHeaderProps = {
  /** Main title for the entity (e.g. facility/program/form name). */
  title: React.ReactNode;
  /**
   * Inline node rendered next to the title — typically a status chip or
   * status picker. Sits on the same line as the title.
   */
  status?: React.ReactNode;
  /** Optional secondary description rendered below the title. */
  description?: React.ReactNode;
  /** Right-aligned action buttons (Settings, etc). */
  actions?: React.ReactNode;
  /**
   * Optional tabs/section nav rendered inside the header chrome. The
   * scroll container toggles `data-scrolled` on itself, which CSS reads
   * to compact these tabs as the user scrolls.
   */
  tabs?: React.ReactNode;
  className?: string;
  /** When true (default), the header is sticky to the top of its scroll container. */
  sticky?: boolean;
};

export function ItemPageHeader({ title, status, description, actions, tabs, className, sticky = true }: ItemPageHeaderProps) {
  const ref = usePageHeaderMeasure(sticky);
  return (
    <div className={cn(sticky ? "app-page-header-sticky" : null)} ref={ref}>
      <div
        className={cn(
          "flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
          className
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="ui-page-title min-w-0 truncate">{title}</h1>
            {status ? <div className="flex shrink-0 items-center">{status}</div> : null}
          </div>
          {description ? (
            <p className="max-w-[68ch] text-sm leading-relaxed text-text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </div>
  );
}
