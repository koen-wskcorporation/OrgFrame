"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { SurfaceBody, SurfaceCloseButton, SurfaceFooter, SurfaceHeader } from "@orgframe/ui/primitives/surface";
import { cn } from "./utils";

const POPUP_COUNT_ATTRIBUTE = "data-popup-count";
// Tracks only fullscreen popups (size="full"). Used by Panel to decide whether
// to re-anchor itself under the popup's header — small confirm/dialog popups
// must NOT trigger panel repositioning.
const POPUP_FULLSCREEN_COUNT_ATTRIBUTE = "data-popup-fullscreen-count";

export type PopupProps = {
  open: boolean;
  onClose: () => void;
  onOpenSettled?: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  viewKey?: string | number;
  viewDirection?: "forward" | "back";
  footer?: React.ReactNode;
  contentClassName?: string;
  popupClassName?: string;
  popupStyle?: React.CSSProperties;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnBackdrop?: boolean;
};

function getPopupSizeClass(size: PopupProps["size"]) {
  switch (size) {
    case "sm":
      return "max-w-md";
    case "lg":
      return "max-w-2xl";
    case "xl":
      return "max-w-4xl";
    case "full":
      return "max-w-none";
    case "md":
    default:
      return "max-w-xl";
  }
}

export function Popup({
  open,
  onClose,
  onOpenSettled,
  title,
  subtitle,
  children,
  viewKey,
  viewDirection = "forward",
  footer,
  contentClassName,
  popupClassName,
  popupStyle,
  size = "md",
  closeOnBackdrop = true
}: PopupProps) {
  const TRANSITION_MS = 220;
  const onCloseRef = React.useRef(onClose);
  const onOpenSettledRef = React.useRef(onOpenSettled);
  const popupRef = React.useRef<HTMLElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const isClosingRef = React.useRef(false);
  const myPopupIndex = React.useRef(0);
  const titleId = React.useId();
  const [mounted, setMounted] = React.useState(false);
  const [rendered, setRendered] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [activeViewKey, setActiveViewKey] = React.useState<string | number>(viewKey ?? "__default");
  const [displayChildren, setDisplayChildren] = React.useState<React.ReactNode>(children);
  const [contentVisible, setContentVisible] = React.useState(true);
  const [contentDirection, setContentDirection] = React.useState<"forward" | "back">(viewDirection);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    onOpenSettledRef.current = onOpenSettled;
  }, [onOpenSettled]);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => {
    if (viewKey === undefined) {
      setDisplayChildren(children);
      return;
    }

    if (activeViewKey === viewKey) {
      setDisplayChildren(children);
      return;
    }

    setContentDirection(viewDirection);
    setContentVisible(false);

    const timeoutId = window.setTimeout(() => {
      setActiveViewKey(viewKey);
      setDisplayChildren(children);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [activeViewKey, children, viewDirection, viewKey]);

  React.useEffect(() => {
    if (!mounted) {
      return;
    }

    if (open) {
      isClosingRef.current = false;
      setRendered(true);
      const frameId = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frameId);
    }

    setVisible(false);
    const timeoutId = window.setTimeout(() => setRendered(false), TRANSITION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [mounted, open]);

  const ready = rendered && mounted;
  const isFull = size === "full";
  const popupMotionClass =
    "transition-[transform,opacity] duration-[220ms] ease-out motion-reduce:transition-none motion-safe:transform-gpu motion-safe:will-change-[transform,opacity]";

  React.useEffect(() => {
    if (!ready || !open || !visible) {
      return;
    }

    const popupNode = popupRef.current;
    if (!popupNode) {
      return;
    }

    let completed = false;
    const finish = () => {
      if (completed) {
        return;
      }
      completed = true;
      onOpenSettledRef.current?.();
    };

    const parseDurationMs = (raw: string) => {
      const parts = raw
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean);
      if (parts.length === 0) {
        return 0;
      }

      const values = parts
        .map((token) => {
          if (token.endsWith("ms")) {
            return Number.parseFloat(token);
          }
          if (token.endsWith("s")) {
            return Number.parseFloat(token) * 1000;
          }
          return Number.parseFloat(token);
        })
        .filter((value) => Number.isFinite(value));
      return values.length > 0 ? Math.max(...values) : 0;
    };

    const styles = window.getComputedStyle(popupNode);
    const transitionDurationMs = parseDurationMs(styles.transitionDuration);
    const transitionDelayMs = parseDurationMs(styles.transitionDelay);
    const totalTransitionMs = transitionDurationMs + transitionDelayMs;

    if (totalTransitionMs <= 0) {
      const rafA = window.requestAnimationFrame(() => {
        const rafB = window.requestAnimationFrame(() => {
          finish();
          window.cancelAnimationFrame(rafB);
        });
      });

      return () => {
        window.cancelAnimationFrame(rafA);
      };
    }

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== popupNode) {
        return;
      }
      if (event.propertyName !== "transform" && event.propertyName !== "opacity") {
        return;
      }

      const rafA = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => finish());
      });
      void rafA;
    };
    popupNode.addEventListener("transitionend", onTransitionEnd);

    const timerId = window.setTimeout(() => {
      finish();
    }, Math.ceil(totalTransitionMs + 80));

    return () => {
      popupNode.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(timerId);
    };
  }, [ready, open, visible]);

  function requestClose() {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    setVisible(false);

    closeTimerRef.current = window.setTimeout(() => {
      isClosingRef.current = false;
      onCloseRef.current();
    }, TRANSITION_MS);
  }

  React.useLayoutEffect(() => {
    if (!ready) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Only the topmost popup should respond. Without this gate, Escape
        // fires every mounted popup's listener and stacked popups (e.g. a
        // wizard with a fullscreen picker over it) all close together.
        const currentCount = Number(document.body.getAttribute(POPUP_COUNT_ATTRIBUTE) ?? "0");
        if (myPopupIndex.current !== currentCount) {
          return;
        }
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const popupNode = popupRef.current;
      if (!popupNode || !popupNode.contains(target)) {
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

    const popupCount = Number(document.body.getAttribute(POPUP_COUNT_ATTRIBUTE) ?? "0");
    myPopupIndex.current = popupCount + 1;
    document.body.setAttribute(POPUP_COUNT_ATTRIBUTE, String(popupCount + 1));
    document.body.classList.add("overflow-hidden");
    if (isFull) {
      const fsCount = Number(document.body.getAttribute(POPUP_FULLSCREEN_COUNT_ATTRIBUTE) ?? "0");
      document.body.setAttribute(POPUP_FULLSCREEN_COUNT_ATTRIBUTE, String(fsCount + 1));
    }

    return () => {
      const nextCount = Math.max(0, Number(document.body.getAttribute(POPUP_COUNT_ATTRIBUTE) ?? "1") - 1);
      if (nextCount === 0) {
        document.body.removeAttribute(POPUP_COUNT_ATTRIBUTE);
        document.body.classList.remove("overflow-hidden");
      } else {
        document.body.setAttribute(POPUP_COUNT_ATTRIBUTE, String(nextCount));
      }
      if (isFull) {
        const nextFs = Math.max(0, Number(document.body.getAttribute(POPUP_FULLSCREEN_COUNT_ATTRIBUTE) ?? "1") - 1);
        if (nextFs === 0) {
          document.body.removeAttribute(POPUP_FULLSCREEN_COUNT_ATTRIBUTE);
        } else {
          document.body.setAttribute(POPUP_FULLSCREEN_COUNT_ATTRIBUTE, String(nextFs));
        }
      }
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ready, isFull]);

  if (!ready) {
    return null;
  }

  // Z-index strategy:
  //   - Fullscreen popups use 1200/1201. Panels (z-1300) deliberately sit
  //     ABOVE them so editor flows can keep panels interactable on top of
  //     a fullscreen editor popup.
  //   - Non-fullscreen popups (small confirm/dialog) use 1400/1401 — they
  //     sit ABOVE panels so the backdrop dims the panel and the dialog is
  //     unambiguously on top. This is what users expect from a confirm.
  const overlayZ = isFull ? "z-[1200]" : "z-[1400]";
  const dialogZ = isFull ? "z-[1201]" : "z-[1401]";
  return createPortal(
    <div className={cn("fixed inset-0 flex items-center justify-center", overlayZ, isFull ? "p-0" : "p-4 sm:p-6")}>
      <button
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-[220ms] ease-out motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={closeOnBackdrop ? requestClose : undefined}
        tabIndex={-1}
        type="button"
      />

      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          isFull
            ? "relative flex h-screen w-screen flex-col overflow-hidden rounded-none border-0 bg-surface shadow-none"
            : "relative flex max-h-[min(100vh-2rem,56rem)] w-full flex-col overflow-hidden rounded-card border bg-surface shadow-floating sm:max-h-[min(100vh-3rem,56rem)]",
          dialogZ,
          popupMotionClass,
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0",
          getPopupSizeClass(size),
          popupClassName
        )}
        data-popup-size={size}
        role="dialog"
        ref={popupRef}
        style={popupStyle}
      >
        <SurfaceHeader title={title} subtitle={subtitle} titleId={titleId} />
        <SurfaceCloseButton className="z-[1202]" label="Close popup" onClick={requestClose} />
        <SurfaceBody className={contentClassName} padded={!isFull}>
          <div
            className={cn(
              "transition-all duration-200 ease-out motion-reduce:transition-none",
              isFull ? "h-full" : null,
              contentVisible
                ? "translate-y-0 translate-x-0 opacity-100"
                : contentDirection === "forward"
                  ? "translate-y-1 translate-x-2 opacity-0"
                  : "translate-y-1 -translate-x-2 opacity-0"
            )}
            key={String(activeViewKey)}
          >
            {displayChildren}
          </div>
        </SurfaceBody>

        {footer ? <SurfaceFooter footerRef={footerRef}>{footer}</SurfaceFooter> : null}
      </section>
    </div>,
    document.body
  );
}
