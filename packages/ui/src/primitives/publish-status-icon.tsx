"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./utils";
import { Button } from "@orgframe/ui/primitives/button";
import { ChipButton, type ChipProps } from "@orgframe/ui/primitives/chip";

type PublishStatusIconProps = {
  isPublished: boolean;
  onToggle: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  statusLabel?: string;
  publishedStatusText?: string;
  unpublishedStatusText?: string;
  publishLabel?: string;
  unpublishLabel?: string;
  className?: string;
  menuClassName?: string;
  align?: "left" | "right";
  size?: ChipProps["size"];
};

export function PublishStatusIcon({
  isPublished,
  onToggle,
  isLoading = false,
  disabled = false,
  statusLabel,
  publishedStatusText = "Published",
  unpublishedStatusText = "Draft",
  publishLabel = "Publish",
  unpublishLabel = "Unpublish",
  className,
  menuClassName,
  align = "left",
  size = "regular"
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
      <ChipButton
        aria-label={statusLabel ?? (isPublished ? "Published status" : "Unpublished status")}
        color={isPublished ? "green" : "red"}
        disabled={disabled || isLoading}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        size={size}
        type="button"
      >
        {isPublished ? publishedStatusText : unpublishedStatusText}
      </ChipButton>
      {open ? (
        <div
          className={cn(
            "absolute top-full z-20 mt-1 w-36 rounded-control border bg-surface p-2 shadow-floating",
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
