"use client";

import * as React from "react";

/**
 * Tracks the rendered height of a sticky page header into the
 * `--app-page-header-height` CSS var on `document.documentElement`, so
 * descendant sticky elements (data-table column headers, in-card
 * toolbars, etc) can pin themselves below the page header without
 * each one re-measuring it.
 *
 * Returns a ref that the caller attaches to the page header's outer
 * element. No-op when `enabled` is false (e.g. non-sticky variants),
 * and clears the var on unmount so other shells (account / auth)
 * don't inherit a stale value.
 */
export function usePageHeaderMeasure(enabled: boolean) {
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
