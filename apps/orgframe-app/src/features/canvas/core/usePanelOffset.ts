"use client";

import * as React from "react";

/**
 * Smooth side-panel offset for canvas editors.
 *
 * The panel system writes `--panel-active-width` (in pixels) onto
 * `document.body` as panels open and close. That value flips instantly,
 * which is fine for CSS transitions on a single property but bad for canvas
 * editors: they have to keep three things in lockstep — the world-transform
 * centering math (JS-computed inline transform), the grid background
 * position (CSS, transitions natively), and the floating action bar's
 * horizontal offset. If any of those animate at slightly different rates
 * during the 220ms transition, grid lines visibly drift past node corners.
 *
 * This hook gives every editor a single source of truth: a numeric panel
 * offset in CSS pixels that smoothly interpolates from old → new whenever
 * `--panel-active-width` changes. Editors plug it into all three uses, so
 * everything moves on the same easing curve at the same time.
 *
 * Implementation:
 * - Subscribes to `document.body` style mutations and re-reads the var.
 * - Animates `current` toward `target` via `requestAnimationFrame` with
 *   a cubic ease-out (matches `cubic-bezier(0.22, 1, 0.36, 1)` shape).
 * - Snaps when the gap is < 0.5px to avoid endless tiny re-renders.
 */
export function usePanelOffset(): number {
  const [target, setTarget] = React.useState(0);
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const read = () => {
      const value = Number.parseFloat(
        getComputedStyle(document.body).getPropertyValue("--panel-active-width").trim()
      ) || 0;
      setTarget(value);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (Math.abs(current - target) < 0.5) {
      if (current !== target) setCurrent(target);
      return;
    }
    let raf = 0;
    const startTs = performance.now();
    const startVal = current;
    const duration = 220;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      // Cubic ease-out — matches the shape of cubic-bezier(0.22, 1, 0.36, 1)
      // closely enough for visual coherence with CSS transitions elsewhere.
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(startVal + (target - startVal) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Deliberately depend only on `target` — restarting on every `current`
    // change would re-trigger the animation each frame and never settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}
