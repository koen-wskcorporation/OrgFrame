"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { SurfaceBody, SurfaceCloseButton, SurfaceFooter, SurfaceHeader } from "@orgframe/ui/primitives/surface";
import { cn } from "./utils";

const PANEL_WIDTH = 325;
const PANEL_COUNT_ATTRIBUTE = "data-panel-count";
const APP_PANEL_COUNT_ATTRIBUTE = "data-app-panel-count";
const POPUP_PANEL_COUNT_ATTRIBUTE = "data-popup-panel-count";
const PRIMARY_HEADER_ID = "app-primary-header";
const POPUP_PANEL_DOCK_ID = "popup-panel-dock";

export type PanelProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerShowAvatar?: boolean;
  headerAvatarUrl?: string | null;
  headerAvatarAlt?: string;
  headerTopAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
  contentClassName?: string;
  panelStyle?: React.CSSProperties;
  pushMode?: "content" | "app";
  globalPanel?: boolean;
};

type PanelScreen = {
  key: string;
  label: string;
};

type PanelScreensProps = {
  screens: PanelScreen[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
};

export function Panel({
  open,
  onClose,
  title,
  subtitle,
  headerShowAvatar = false,
  headerAvatarUrl,
  headerAvatarAlt,
  headerTopAction,
  children,
  footer,
  panelClassName,
  contentClassName,
  panelStyle,
  pushMode = "content",
  globalPanel = false
}: PanelProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const [mounted, setMounted] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);
  const resolvePortalTarget = React.useCallback(() => {
    return document.getElementById(POPUP_PANEL_DOCK_ID) ?? document.getElementById("panel-dock") ?? document.body;
  }, []);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    setMounted(true);
    setPortalTarget(resolvePortalTarget());
    return () => setMounted(false);
  }, [resolvePortalTarget]);

  React.useEffect(() => {
    if (!mounted) {
      return;
    }

    setPortalTarget(resolvePortalTarget());
  }, [mounted, open, resolvePortalTarget]);

  // Listen for `panel-dock-changed` so already-open panels can re-portal into
  // a popup-panel-dock that appears mid-life (e.g. when a fullscreen editor
  // popup mounts and wants the wizard panel docked inside it).
  React.useEffect(() => {
    if (!mounted) return;
    const onDockChanged = () => {
      const next = resolvePortalTarget();
      setPortalTarget((current) => (current === next ? current : next));
    };
    window.addEventListener("panel-dock-changed", onDockChanged);
    return () => window.removeEventListener("panel-dock-changed", onDockChanged);
  }, [mounted, resolvePortalTarget]);

  const isPopupContext = portalTarget?.getAttribute("data-panel-context") === "popup";

  const ready = open && mounted && Boolean(portalTarget);

  React.useLayoutEffect(() => {
    if (!ready) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const panelNode = panelRef.current;
      if (!panelNode || !panelNode.contains(target)) {
        return;
      }

      if (target.closest("textarea, [contenteditable='true']")) {
        return;
      }

      if (target.closest("button, a")) {
        return;
      }

      const footerNode = footerRef.current;
      if (!footerNode) {
        return;
      }

      const submitButton = footerNode.querySelector<HTMLButtonElement>("button[type='submit']:not([disabled])");
      const fallbackButtons = Array.from(footerNode.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const primaryButton = submitButton ?? fallbackButtons[fallbackButtons.length - 1];
      if (!primaryButton) {
        return;
      }

      event.preventDefault();
      primaryButton.click();
    };
    document.addEventListener("keydown", onKeyDown);

    if (isPopupContext) {
      const popupDock = portalTarget as HTMLElement;
      const popupRoot = popupDock.closest("[data-popup-editor-root='true']") as HTMLElement | null;

      const syncPopupPanelOffset = () => {
        if (!popupRoot) {
          return;
        }

        const rootStyles = window.getComputedStyle(document.documentElement);
        const layoutGap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
        const viewportAllowance = Math.max(0, popupRoot.clientWidth - layoutGap * 2);
        const panelWidth = Math.min(viewportAllowance, PANEL_WIDTH);
        popupRoot.style.setProperty("--popup-panel-active-width", `${Math.round(panelWidth)}px`);
        popupRoot.style.setProperty("--popup-panel-gap", `${Math.round(layoutGap)}px`);
      };

      const popupCount = Number(portalTarget.getAttribute(POPUP_PANEL_COUNT_ATTRIBUTE) ?? "0");
      portalTarget.setAttribute(POPUP_PANEL_COUNT_ATTRIBUTE, String(popupCount + 1));
      syncPopupPanelOffset();
      const rafId = window.requestAnimationFrame(syncPopupPanelOffset);
      window.addEventListener("resize", syncPopupPanelOffset);

      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener("resize", syncPopupPanelOffset);
        const nextCount = Math.max(0, Number(portalTarget.getAttribute(POPUP_PANEL_COUNT_ATTRIBUTE) ?? "1") - 1);
        if (nextCount === 0) {
          portalTarget.removeAttribute(POPUP_PANEL_COUNT_ATTRIBUTE);
          popupRoot?.style.removeProperty("--popup-panel-active-width");
          popupRoot?.style.removeProperty("--popup-panel-gap");
        } else {
          portalTarget.setAttribute(POPUP_PANEL_COUNT_ATTRIBUTE, String(nextCount));
          syncPopupPanelOffset();
        }
        document.removeEventListener("keydown", onKeyDown);
      };
    }

    const panelCount = Number(document.body.getAttribute(PANEL_COUNT_ATTRIBUTE) ?? "0");

    const syncPanelTop = () => {
      if (globalPanel) {
        panelRef.current?.style.setProperty("--panel-top", "0px");
        return;
      }

      const header = document.getElementById(PRIMARY_HEADER_ID);
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const rootStyles = window.getComputedStyle(document.documentElement);
      const orgHeaderBottom = Number.parseFloat(rootStyles.getPropertyValue("--org-header-bottom")) || 0;
      const layoutGap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
      const panelTop = Math.max(0, Math.round(Math.max(headerBottom, orgHeaderBottom) + layoutGap));
      panelRef.current?.style.setProperty("--panel-top", `${panelTop}px`);
    };
    const syncPanelWidth = () => {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const layoutGap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
      const viewportAllowance = globalPanel ? Math.max(0, window.innerWidth) : Math.max(0, window.innerWidth - layoutGap * 2);
      const fallbackPanelWidth = Math.min(viewportAllowance, PANEL_WIDTH);
      const measuredPanelWidth = panelRef.current ? Math.round(panelRef.current.getBoundingClientRect().width) : 0;
      const panelWidth = measuredPanelWidth > 0 ? Math.min(window.innerWidth, measuredPanelWidth) : fallbackPanelWidth;
      document.body.style.setProperty("--panel-active-width", `${panelWidth}px`);
    };

    const appPanelCount = Number(document.body.getAttribute(APP_PANEL_COUNT_ATTRIBUTE) ?? "0");
    document.body.setAttribute(PANEL_COUNT_ATTRIBUTE, String(panelCount + 1));
    document.body.classList.add("panel-open-content");
    if (pushMode === "app") {
      document.body.setAttribute(APP_PANEL_COUNT_ATTRIBUTE, String(appPanelCount + 1));
      document.body.classList.add("panel-open-app");
    }
    syncPanelTop();
    syncPanelWidth();
    const headerResizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncPanelTop();
            syncPanelWidth();
          })
        : null;
    const panelResizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncPanelTop();
            syncPanelWidth();
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
    const widthRafId = window.requestAnimationFrame(syncPanelWidth);
    window.addEventListener("resize", syncPanelTop);
    window.addEventListener("resize", syncPanelWidth);
    window.addEventListener("scroll", syncPanelTop, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(widthRafId);
      window.removeEventListener("resize", syncPanelTop);
      window.removeEventListener("resize", syncPanelWidth);
      window.removeEventListener("scroll", syncPanelTop);
      headerResizeObserver?.disconnect();
      panelResizeObserver?.disconnect();
      const nextCount = Math.max(0, Number(document.body.getAttribute(PANEL_COUNT_ATTRIBUTE) ?? "1") - 1);
      const nextAppCount = Math.max(
        0,
        Number(document.body.getAttribute(APP_PANEL_COUNT_ATTRIBUTE) ?? (pushMode === "app" ? "1" : "0")) - (pushMode === "app" ? 1 : 0)
      );
      if (nextCount === 0) {
        document.body.classList.remove("panel-open-content");
        document.body.removeAttribute(PANEL_COUNT_ATTRIBUTE);
        document.body.style.removeProperty("--panel-active-width");
      } else {
        document.body.setAttribute(PANEL_COUNT_ATTRIBUTE, String(nextCount));
        syncPanelWidth();
      }
      if (nextAppCount === 0) {
        document.body.classList.remove("panel-open-app");
        document.body.removeAttribute(APP_PANEL_COUNT_ATTRIBUTE);
      } else {
        document.body.setAttribute(APP_PANEL_COUNT_ATTRIBUTE, String(nextAppCount));
      }
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [globalPanel, isPopupContext, pushMode, ready]);

  if (!mounted || !open || !portalTarget) {
    return null;
  }

  return createPortal(
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        `app-panel ${isPopupContext ? "absolute z-[1100] rounded-none border-y-0 border-r-0 border-l" : "fixed z-[100] rounded-card border"} pointer-events-auto flex min-w-0 shrink-0 flex-col overflow-hidden bg-surface shadow-floating`,
        panelClassName
      )}
      ref={panelRef}
      role="complementary"
      style={{
        ...panelStyle,
        ...(isPopupContext
          ? {
              bottom: "0",
              right: "0",
              top: "0",
              maxWidth: "100%",
              width: "100%"
            }
          : globalPanel
            ? {
                bottom: "0",
                right: "0",
                top: "0",
                maxWidth: "100vw",
                width: `min(100vw, ${PANEL_WIDTH}px)`
              }
            : {
              bottom: "var(--layout-gap)",
              right: "var(--layout-gap)",
              top: "var(--panel-top, 0px)",
              maxWidth: `min(calc(100vw - (var(--layout-gap) * 2)), ${PANEL_WIDTH}px)`,
              width: `min(calc(100vw - (var(--layout-gap) * 2)), ${PANEL_WIDTH}px)`
            })
      }}
    >
      <SurfaceHeader
        avatarAlt={headerAvatarAlt}
        avatarUrl={headerAvatarUrl}
        showAvatar={headerShowAvatar}
        subtitle={subtitle}
        title={title}
        topAction={headerTopAction}
      />
      <SurfaceCloseButton className="z-[101]" label="Close panel" onClick={onClose} />
      <SurfaceBody className={contentClassName}>{children}</SurfaceBody>
      {footer ? <SurfaceFooter footerRef={footerRef}>{footer}</SurfaceFooter> : null}
    </aside>,
    portalTarget
  );
}

/**
 * Body-level dock target for docked side panels. Render once in the
 * root layout (after `{children}`). Each <Panel> portals its <aside>
 * into this element; the asides themselves use `position: fixed` to
 * pin against the viewport, so the dock doesn't drive positioning —
 * it just exists as a stable React-tree-rooted portal target so panels
 * can mount/unmount with the providers tree above them.
 *
 * The full multi-panel layout system (drag-to-swap order, per-gap
 * orientation toggles for 3- and 4-panel grids, user-resizable splits
 * persisted to preferences) is built on top of this dock — see TODO
 * markers in this file. Until that lands, panels stack via the
 * `--panel-active-width` reservation on `.app__body`.
 */
export function PanelContainer() {
  return <div id="panel-dock" />;
}

export function PanelScreens({ screens, activeKey, onChange, className }: PanelScreensProps) {
  return (
    <div className={cn("inline-flex w-full items-center gap-1 rounded-control border bg-surface p-1", className)}>
      {screens.map((screen) => (
        <button
          className={cn(
            "min-w-0 flex-1 rounded-control px-2 py-1.5 text-xs font-semibold transition-colors",
            activeKey === screen.key ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
          )}
          key={screen.key}
          onClick={() => onChange(screen.key)}
          type="button"
        >
          <span className="truncate">{screen.label}</span>
        </button>
      ))}
    </div>
  );
}
