"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 325;
const PANEL_COUNT_ATTRIBUTE = "data-panel-count";
const PRIMARY_HEADER_ID = "app-primary-header";

type PanelProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
  contentClassName?: string;
  panelStyle?: React.CSSProperties;
};

export function Panel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  panelClassName,
  contentClassName,
  panelStyle
}: PanelProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const [mounted, setMounted] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    setMounted(true);
    setPortalTarget(document.getElementById("panel-dock") ?? document.body);
    return () => setMounted(false);
  }, []);

  const ready = open && mounted && Boolean(portalTarget);

  React.useLayoutEffect(() => {
    if (!ready) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    const panelCount = Number(document.body.getAttribute(PANEL_COUNT_ATTRIBUTE) ?? "0");

    const syncPanelTop = () => {
      const header = document.getElementById(PRIMARY_HEADER_ID);
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const panelTop = Math.max(0, Math.round(headerBottom));
      panelRef.current?.style.setProperty("--panel-top", `${panelTop}px`);
    };
    const syncPanelWidth = () => {
      const panelWidth = Math.min(window.innerWidth, PANEL_WIDTH);
      document.body.style.setProperty("--panel-active-width", `${Math.round(panelWidth)}px`);
    };

    document.body.setAttribute(PANEL_COUNT_ATTRIBUTE, String(panelCount + 1));
    document.body.classList.add("panel-open");
    syncPanelTop();
    syncPanelWidth();
    const headerResizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncPanelTop();
          })
        : null;
    const panelResizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncPanelTop();
          })
        : null;
    const header = document.getElementById(PRIMARY_HEADER_ID);

    if (header && headerResizeObserver) {
      headerResizeObserver.observe(header);
    }

    if (panelRef.current && panelResizeObserver) {
      panelResizeObserver.observe(panelRef.current);
    }

    const rafId = window.requestAnimationFrame(syncPanelTop);
    window.addEventListener("resize", syncPanelTop);
    window.addEventListener("resize", syncPanelWidth);
    window.addEventListener("scroll", syncPanelTop, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", syncPanelTop);
      window.removeEventListener("resize", syncPanelWidth);
      window.removeEventListener("scroll", syncPanelTop);
      headerResizeObserver?.disconnect();
      panelResizeObserver?.disconnect();
      const nextCount = Math.max(0, Number(document.body.getAttribute(PANEL_COUNT_ATTRIBUTE) ?? "1") - 1);
      if (nextCount === 0) {
        document.body.classList.remove("panel-open");
        document.body.removeAttribute(PANEL_COUNT_ATTRIBUTE);
        document.body.style.removeProperty("--panel-active-width");
      } else {
        document.body.setAttribute(PANEL_COUNT_ATTRIBUTE, String(nextCount));
        syncPanelWidth();
      }
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ready]);

  if (!mounted || !open || !portalTarget) {
    return null;
  }

  return createPortal(
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "app-panel fixed bottom-0 right-0 z-[100]",
        "flex min-w-0 shrink-0 flex-col border-l bg-surface shadow-floating",
        panelClassName
      )}
      ref={panelRef}
      role="complementary"
      style={{
        ...panelStyle,
        top: "var(--panel-top, 0px)",
        maxWidth: `min(100vw, ${PANEL_WIDTH}px)`,
        width: `min(100vw, ${PANEL_WIDTH}px)`
      }}
    >
      <div className="relative shrink-0 border-b px-5 py-4 pr-16">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
      </div>

      <button
        aria-label="Close panel"
        className="absolute right-3 top-3 z-[101] inline-flex h-9 w-9 items-center justify-center rounded-full border bg-surface text-lg leading-none text-text shadow-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onClose}
        type="button"
      >
        ×
      </button>

      <div className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-4 [overflow-wrap:anywhere]", contentClassName)}>{children}</div>

      {footer ? <div className="shrink-0 border-t bg-surface px-5 py-4 flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
    </aside>,
    portalTarget
  );
}
