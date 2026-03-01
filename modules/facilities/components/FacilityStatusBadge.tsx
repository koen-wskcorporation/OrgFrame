"use client";

import { Badge } from "@/components/ui/badge";
import type { FacilityPublicSpaceStatus, FacilityReservationStatus, FacilitySpaceStatus } from "@/modules/facilities/types";

type FacilityStatusBadgeProps = {
  status: FacilitySpaceStatus | FacilityReservationStatus | FacilityPublicSpaceStatus;
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

export function FacilityStatusBadge({ status }: FacilityStatusBadgeProps) {
  return <Badge variant={resolveVariant(status)}>{resolveLabel(status)}</Badge>;
}
