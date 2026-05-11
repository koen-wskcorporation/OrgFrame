"use client";

import * as React from "react";
import { cn } from "./utils";

type PageHeaderProps = {
  title: React.ReactNode;
  /**
   * Inline node rendered next to the title — typically a status chip
   * or status picker on entity detail pages. When present, the title
   * row aligns to the top of the actions row instead of the bottom.
   */
  status?: React.ReactNode;
  description?: React.ReactNode;
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

// Tracks the rendered height of a sticky page header into the
// `--app-page-header-height` CSS var on `document.documentElement`, so
// descendant sticky elements (data-table column headers, in-card
// toolbars, etc) can pin themselves below the page header without
// each one re-measuring it.
function usePageHeaderMeasure(enabled: boolean) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const h = Math.round(node.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--app-page-header-height", `${h}px`);
    };
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(node);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--app-page-header-height");
    };
  }, [enabled]);

  return ref;
}

export function PageHeader({
  title,
  status,
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
          "flex flex-col gap-4 md:flex-row md:justify-between",
          status ? "md:items-start" : "md:items-end",
          showBorder ? "border-b pb-5 md:pb-6" : "",
          className
        )}
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="ui-page-title min-w-0 truncate">{title}</h1>
            {status ? <div className="flex shrink-0 items-center">{status}</div> : null}
          </div>
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
