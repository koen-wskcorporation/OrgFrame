"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function Tooltip({ children, className, content }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    setPosition({
      left: rect.left + rect.width / 2,
      top: rect.top - 8
    });
  }, []);

  const show = React.useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = React.useCallback(() => {
    setOpen(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span className="inline-flex" onBlur={hide} onFocus={show} onMouseEnter={show} onMouseLeave={hide} ref={triggerRef} tabIndex={0}>
        {children}
      </span>
      {open && position
        ? createPortal(
            <div
              className={cn(
                "pointer-events-none fixed z-[3500] -translate-x-1/2 -translate-y-full rounded border bg-surface px-2 py-1 text-[11px] font-medium text-text shadow-floating",
                className
              )}
              role="tooltip"
              style={{ left: position.left, top: position.top }}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
