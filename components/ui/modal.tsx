"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

const MODAL_COUNT_ATTRIBUTE = "data-modal-count";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "md" | "lg" | "full";
  closeLabel?: string;
  closeOnOverlayClick?: boolean;
};

const modalSizeClassName: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  full: "max-w-none"
};

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  size = "md",
  closeLabel = "Close dialog",
  closeOnOverlayClick = true
}: ModalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setMounted(true);
    setPortalTarget(document.body);
    return () => setMounted(false);
  }, []);

  const ready = mounted && open && Boolean(portalTarget);
  const isFullscreen = size === "full";

  React.useLayoutEffect(() => {
    if (!ready) {
      return;
    }

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentCount = Number(document.body.getAttribute(MODAL_COUNT_ATTRIBUTE) ?? "0");

    document.body.setAttribute(MODAL_COUNT_ATTRIBUTE, String(currentCount + 1));
    document.body.classList.add("modal-open");

    const focusTarget =
      containerRef.current?.querySelector<HTMLElement>("[data-autofocus='true']") ??
      getFocusableElements(containerRef.current)[0] ??
      containerRef.current;

    const rafId = window.requestAnimationFrame(() => {
      focusTarget?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(containerRef.current);

      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);

      const nextCount = Math.max(0, Number(document.body.getAttribute(MODAL_COUNT_ATTRIBUTE) ?? "1") - 1);

      if (nextCount === 0) {
        document.body.classList.remove("modal-open");
        document.body.removeAttribute(MODAL_COUNT_ATTRIBUTE);
      } else {
        document.body.setAttribute(MODAL_COUNT_ATTRIBUTE, String(nextCount));
      }

      previousActiveElement?.focus();
    };
  }, [onClose, ready]);

  if (!ready || !portalTarget) {
    return null;
  }

  return createPortal(
    <div className={cn("fixed inset-0 z-[500] flex items-center justify-center", isFullscreen ? "p-0" : "p-4 sm:p-6")}>
      <div
        aria-hidden="true"
        className="ui-modal-overlay absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--accent)/0.16),_transparent_38%),linear-gradient(180deg,_hsl(210_30%_99%/0.9),_hsl(220_25%_90%/0.93))] backdrop-blur-md"
        onMouseDown={() => {
          if (closeOnOverlayClick) {
            onClose();
          }
        }}
      />

      <div
        aria-modal="true"
        className={cn(
          "ui-modal-card relative z-[1] flex w-full flex-col overflow-hidden rounded-[32px] border border-white/75 bg-[linear-gradient(180deg,hsl(0_0%_100%/0.98),hsl(200_25%_98%/0.96))] shadow-[0_30px_90px_hsl(220_35%_12%/0.18)]",
          isFullscreen ? "h-full max-h-full w-full rounded-none border-0" : "max-h-[min(90vh,880px)]",
          modalSizeClassName[size],
          className
        )}
        ref={containerRef}
        role="dialog"
        tabIndex={-1}
      >
        {title || description ? (
          <div className="relative shrink-0 border-b border-border/70 px-6 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
            {title ? <h2 className="pr-12 text-[clamp(1.55rem,2vw,2rem)] font-semibold tracking-[-0.03em] text-text">{title}</h2> : null}
            {description ? <p className="mt-2 pr-10 text-sm leading-relaxed text-text-muted">{description}</p> : null}
          </div>
        ) : null}

        <IconButton
          className="absolute right-4 top-4 z-[2] h-10 w-10 rounded-full border border-border/65 bg-white/70 text-text-muted shadow-sm backdrop-blur hover:bg-white"
          icon={<X />}
          label={closeLabel}
          onClick={onClose}
        />

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:px-8 sm:pb-8", contentClassName)}>{children}</div>

        {footer ? <div className="shrink-0 border-t border-border/70 bg-white/60 px-6 py-4 backdrop-blur sm:px-8">{footer}</div> : null}
      </div>
    </div>,
    portalTarget
  );
}
