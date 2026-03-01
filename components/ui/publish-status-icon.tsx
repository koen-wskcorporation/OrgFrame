"use client";

import { CircleCheck, CircleX, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PublishStatusIconProps = {
  isPublished: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  statusLabel?: string;
  publishLabel?: string;
  unpublishLabel?: string;
  className?: string;
  menuClassName?: string;
  align?: "left" | "right";
};

export function PublishStatusIcon({
  isPublished,
  onToggle,
  isLoading = false,
  disabled = false,
  statusLabel,
  publishLabel = "Publish",
  unpublishLabel = "Unpublish",
  className,
  menuClassName,
  align = "left"
}: PublishStatusIconProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (wrapperRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)} data-no-progress="true" ref={wrapperRef}>
      <button
        aria-label={statusLabel ?? (isPublished ? "Published status" : "Unpublished status")}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-surface-muted"
        disabled={disabled || isLoading}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        type="button"
      >
        {isPublished ? <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <CircleX className="h-3.5 w-3.5 shrink-0 text-red-500" />}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute top-6 z-20 w-36 rounded-control border bg-surface p-2 shadow-floating",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          <Button
            className="w-full justify-start"
            loading={isLoading}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggle();
            }}
            size="sm"
            type="button"
            variant={isPublished ? "secondary" : "primary"}
          >
            {isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {isPublished ? unpublishLabel : publishLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
