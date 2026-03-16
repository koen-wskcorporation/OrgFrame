"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isReservedOrgSlug } from "@/lib/org/reservedSlugs";

const INITIAL_PROGRESS = 8;
const MAX_TRICKLE_PROGRESS = 92;
const TRICKLE_INTERVAL_MS = 140;
const HIDE_DELAY_MS = 180;
const FAILSAFE_COMPLETE_MS = 15000;

function shouldIgnoreClick(event: MouseEvent) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function findAnchorFromEvent(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function shouldIgnoreProgressTarget(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("[data-no-progress='true']"));
}

function shouldStartForAnchor(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href");

  if (!href) {
    return false;
  }

  if (anchor.target && anchor.target !== "_self") {
    return false;
  }

  if (anchor.hasAttribute("download")) {
    return false;
  }

  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(href, window.location.href);
  } catch {
    return false;
  }

  if (targetUrl.origin !== window.location.origin) {
    return false;
  }

  return !(targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search);
}

export function HeaderProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  const isOrgRoute = firstSegment.length > 0 && !isReservedOrgSlug(firstSegment);

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [orgAccent, setOrgAccent] = useState<string | null>(null);

  const isNavigatingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const trickleIntervalRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const failSafeTimeoutRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (trickleIntervalRef.current !== null) {
      window.clearInterval(trickleIntervalRef.current);
      trickleIntervalRef.current = null;
    }

    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    if (failSafeTimeoutRef.current !== null) {
      window.clearTimeout(failSafeTimeoutRef.current);
      failSafeTimeoutRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (!isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = false;
    clearTimers();
    setProgress(100);

    hideTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
      hideTimeoutRef.current = null;
    }, HIDE_DELAY_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;
    clearTimers();
    setVisible(true);
    setProgress((current) => (current > 0 ? current : INITIAL_PROGRESS));

    trickleIntervalRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current >= MAX_TRICKLE_PROGRESS) {
          return current;
        }

        const remaining = MAX_TRICKLE_PROGRESS - current;
        const step = Math.max(1, Math.round(remaining * 0.12));
        return Math.min(MAX_TRICKLE_PROGRESS, current + step);
      });
    }, TRICKLE_INTERVAL_MS);

    failSafeTimeoutRef.current = window.setTimeout(() => {
      finish();
    }, FAILSAFE_COMPLETE_MS);
  }, [clearTimers, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (shouldIgnoreProgressTarget(event)) {
        return;
      }

      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = findAnchorFromEvent(event);
      if (!anchor || !shouldStartForAnchor(anchor)) {
        return;
      }

      queueMicrotask(() => {
        if (shouldIgnoreClick(event)) {
          return;
        }

        start();
      });
    };

    const onPopState = () => {
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    finish();
  }, [pathname, search, finish]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!isOrgRoute) {
      setOrgAccent(null);
      return;
    }

    const panelDock = document.getElementById("panel-dock");

    if (!panelDock) {
      setOrgAccent(null);
      return;
    }

    const readAccent = () => {
      const accent = panelDock.style.getPropertyValue("--accent").trim();
      setOrgAccent(accent || null);
    };

    readAccent();

    const observer = new MutationObserver(readAccent);
    observer.observe(panelDock, { attributeFilter: ["style"], attributes: true });

    return () => {
      observer.disconnect();
    };
  }, [isOrgRoute]);

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}>
      <div
        className="h-full origin-left transition-transform duration-150 ease-out"
        style={{
          backgroundColor: orgAccent ? `hsl(${orgAccent})` : "hsl(var(--app-accent))",
          transform: `scaleX(${progress / 100})`
        }}
      />
    </div>
  );
}
