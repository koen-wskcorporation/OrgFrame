"use client";

import * as React from "react";
import { cn } from "./utils";
import { usePageHeaderMeasure } from "./page-header-measure";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  /**
   * Tabs / section nav rendered INSIDE the sticky page header so they
   * pin together with the title row instead of scrolling away.
   */
  tabs?: React.ReactNode;
  className?: string;
  showBorder?: boolean;
  /**
   * When true (default) the header pins to the top of the body scroll
   * via .app-page-header-sticky. Set false for non-page contexts
   * (modals, embedded sections).
   */
  sticky?: boolean;
};

export function PageHeader({
  title,
  description,
  actions,
  tabs,
  className,
  showBorder = false,
  sticky = true
}: PageHeaderProps) {
  const ref = usePageHeaderMeasure(sticky);
  return (
    <div className={cn(sticky ? "app-page-header-sticky" : null)} ref={ref}>
      <div
        className={cn(
          "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
          showBorder ? "border-b pb-5 md:pb-6" : "",
          className
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <h1 className="ui-page-title">{title}</h1>
          {description ? (
            <p className="app-page-header__desc max-w-[68ch] text-sm leading-relaxed text-text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>
      {tabs ? <div className="app-page-header__tabs mt-4">{tabs}</div> : null}
    </div>
  );
}
