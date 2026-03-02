"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FacilityPublicSpaceStatus, FacilityReservationStatus, FacilitySpaceStatus } from "@/modules/facilities/types";

type FacilitySpaceStatusOption = {
  value: FacilitySpaceStatus;
  label: string;
};

type FacilityStatusBadgeProps = {
  status: FacilitySpaceStatus | FacilityReservationStatus | FacilityPublicSpaceStatus;
  label?: string;
  disabled?: boolean;
  onSelectSpaceStatus?: (status: FacilitySpaceStatus) => void;
  spaceStatusOptions?: FacilitySpaceStatusOption[];
};

function resolveVariant(status: FacilityStatusBadgeProps["status"]) {
  if (status === "open" || status === "approved") {
    return "success" as const;
  }

  if (status === "pending" || status === "booked") {
    return "warning" as const;
  }

  if (status === "closed" || status === "cancelled" || status === "archived" || status === "rejected") {
    return "destructive" as const;
  }

  return "neutral" as const;
}

function resolveLabel(status: FacilityStatusBadgeProps["status"]) {
  return status.replace(/_/g, " ");
}

export function FacilityStatusBadge({ status, label, disabled = false, onSelectSpaceStatus, spaceStatusOptions }: FacilityStatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canSelectSpaceStatus = Boolean(onSelectSpaceStatus && spaceStatusOptions && spaceStatusOptions.length > 0);

  useEffect(() => {
    if (!isOpen) {
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

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const badge = (
    <Badge className={cn(canSelectSpaceStatus ? "cursor-pointer" : undefined)} variant={resolveVariant(status)}>
      {label ?? resolveLabel(status)}
    </Badge>
  );

  if (!canSelectSpaceStatus) {
    return badge;
  }

  return (
    <div className="relative" data-no-progress="true" ref={wrapperRef}>
      <button
        className="inline-flex"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        {badge}
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-7 z-20 min-w-36 rounded-control border border-border bg-surface p-1.5 shadow-floating">
          {spaceStatusOptions?.map((option) => (
            <button
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-xs font-medium text-text transition-colors hover:bg-surface-muted",
                status === option.value ? "bg-surface-muted" : undefined
              )}
              key={option.value}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectSpaceStatus?.(option.value);
                setIsOpen(false);
              }}
              type="button"
            >
              <span>{option.label}</span>
              {status === option.value ? <Check className="h-3.5 w-3.5 text-text-muted" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
