"use client";

import * as React from "react";

type AppShellProps = {
  /**
   * Top bar slot (org header, etc). When null/false the topbar slot
   * is omitted from the DOM entirely so there's no extra gap.
   */
  topbar: React.ReactNode;
  /**
   * Sidebar slot. When null/false, the body collapses to a single
   * column. Pass `null` for areas that don't need a sidebar (public
   * pages, simple item pages).
   */
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Single application shell. Owns the layout-gap padding, the topbar slot,
 * and the body grid (sidebar + content).
 *
 *   <main class="app">
 *     ├── <div class="app__topbar">  (only when topbar non-null)
 *     └── <div class="app__body">
 *         ├── <aside class="app__sidebar">  (only when sidebar non-null)
 *         └── <div class="app__content">
 *
 * The topbar is a sibling of the body — when a side panel docks, only
 * `.app__body` shrinks. Nothing else needs to coordinate.
 *
 * Sets `data-scrolled` on the content div based on window scroll, so
 * page-header CSS can compact tabs on scroll.
 */
export function AppShell({ topbar, sidebar, children }: AppShellProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const topbarRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Track the topbar's height into `--app-topbar-height` so the sidebar can
  // pin at `top: calc(var(--app-topbar-height) + var(--layout-gap))` —
  // sliding under the topbar's bottom edge once the primary header has
  // scrolled away. Re-measures on resize and on topbar content changes.
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
  const hasSidebar = sidebar != null && sidebar !== false;

  return (
    <main
      className="app"
      data-no-topbar={hasTopbar ? undefined : "true"}
      data-no-sidebar={hasSidebar ? undefined : "true"}
    >
      {hasTopbar ? <div className="app__topbar" ref={topbarRef}>{topbar}</div> : null}
      <div className="app__body">
        {hasSidebar ? <aside className="app__sidebar">{sidebar}</aside> : null}
        <div className="app__content" data-scrolled={scrolled ? "true" : undefined}>
          {children}
        </div>
      </div>
    </main>
  );
}
