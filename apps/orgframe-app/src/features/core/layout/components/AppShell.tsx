"use client";

import * as React from "react";

type AppShellProps = {
  /**
   * Top bar slot (org header, etc). When null/false the topbar slot
   * is omitted from the DOM entirely so there's no extra gap.
   */
  topbar: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Application shell. Owns the layout-gap padding, the sticky topbar,
 * and the content column.
 *
 *   <main class="app">
 *     ├── <div class="app__topbar">  (only when topbar non-null)
 *     └── <div class="app__content">
 *
 * Sets `data-scrolled` on the content div based on window scroll, so
 * page-header CSS can compact tabs on scroll. Tracks topbar height
 * into `--app-topbar-height` so a sticky sidebar (rendered by a
 * nested layout, e.g. ManageShell) can pin below it.
 *
 * Sidebars are NOT owned by this shell — they're rendered by the
 * route group that needs them (currently just /manage via
 * ManageShell). This avoids parallel-route slot bleed where a stale
 * sidebar would persist on routes that don't use one.
 */
export function AppShell({ topbar, children }: AppShellProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const topbarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const node = topbarRef.current;
    if (!node) {
      document.documentElement.style.removeProperty("--app-topbar-height");
      return;
    }
    const measure = () => {
      const h = Math.round(node.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--app-topbar-height", `${h}px`);
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
      document.documentElement.style.removeProperty("--app-topbar-height");
    };
  }, [topbar]);

  const hasTopbar = topbar != null && topbar !== false;

  return (
    <main className="app" data-no-topbar={hasTopbar ? undefined : "true"}>
      {hasTopbar ? <div className="app__topbar" ref={topbarRef}>{topbar}</div> : null}
      <div className="app__content" data-scrolled={scrolled ? "true" : undefined}>
        {children}
      </div>
    </main>
  );
}
