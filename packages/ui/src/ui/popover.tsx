"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

type PopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  placement?: PopoverPlacement;
  offset?: number;
  viewportPadding?: number;
};

function resolveVerticalPlacement(preferred: PopoverPlacement, anchorRect: DOMRect, popoverHeight: number, viewportPadding: number, offset: number) {
  const prefersBottom = preferred.startsWith("bottom");
  const bottomTop = anchorRect.bottom + offset;
  const topTop = anchorRect.top - offset - popoverHeight;

  if (prefersBottom && bottomTop + popoverHeight <= window.innerHeight - viewportPadding) {
    return "bottom";
  }
  if (!prefersBottom && topTop >= viewportPadding) {
    return "top";
  }
  if (bottomTop + popoverHeight <= window.innerHeight - viewportPadding) {
    return "bottom";
  }
  return "top";
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  className,
  placement = "bottom-end",
  offset = 8,
  viewportPadding = 12
}: PopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const [mounted, setMounted] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false
  });

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useLayoutEffect(() => {
    if (!open || !mounted) {
      return;
    }

    setPosition((current) => ({ ...current, visible: false }));

    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) {
      return;
    }

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const popoverWidth = popover.offsetWidth;
      const popoverHeight = popover.offsetHeight;
      const verticalPlacement = resolveVerticalPlacement(placement, anchorRect, popoverHeight, viewportPadding, offset);
      const alignEnd = placement.endsWith("end");

      const rawLeft = alignEnd ? anchorRect.right - popoverWidth : anchorRect.left;
      const clampedLeft = Math.max(viewportPadding, Math.min(rawLeft, window.innerWidth - viewportPadding - popoverWidth));
      const top =
        verticalPlacement === "bottom" ? anchorRect.bottom + offset : Math.max(viewportPadding, anchorRect.top - offset - popoverHeight);

      window.requestAnimationFrame(() => {
        setPosition({
          top,
          left: clampedLeft,
          visible: true
        });
      });
    };

    updatePosition();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) {
        return;
      }
      if (anchorRef.current?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [anchorRef, mounted, offset, open, placement, viewportPadding]);

  if (!open || !mounted) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "fixed z-[1300] w-[20rem] max-w-[calc(100vw-1.5rem)] origin-top-left rounded-card border bg-surface p-2 shadow-card transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
        position.visible ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95",
        className
      )}
      ref={popoverRef}
      role="menu"
      style={{
        top: position.top,
        left: position.left
      }}
    >
      {children}
    </div>,
    document.body
  );
}
