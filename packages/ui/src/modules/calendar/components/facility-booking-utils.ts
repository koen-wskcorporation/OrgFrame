import type { CalendarReadModel } from "@/modules/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/modules/facilities/types";
import type { FacilityLockMode } from "@/modules/calendar/types";

export type FacilityBookingSelection = {
  spaceId: string;
  configurationId?: string;
  lockMode?: FacilityLockMode;
  allowShared?: boolean;
  notes?: string;
};

export type FacilityBookingWindow = {
  occurrenceId?: string;
  startsAtUtc: string;
  endsAtUtc: string;
  label?: string;
};

export type FacilityBookingConflict = {
  spaceId: string;
  spaceName: string;
  occurrenceId?: string;
  occurrenceLabel: string;
  conflictType: "allocation" | "reservation";
  conflictId: string;
  conflictStartsAtUtc: string;
  conflictEndsAtUtc: string;
  conflictStatus?: string | null;
};

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(bStart) || !Number.isFinite(bEnd)) {
    return false;
  }
  return aStart < bEnd && aEnd > bStart;
}

export function buildSpaceById(spaces: FacilitySpace[]) {
  return new Map(spaces.map((space) => [space.id, space]));
}

export function resolveRootSpaceId(spaceId: string, spaceById: Map<string, FacilitySpace>) {
  let current = spaceById.get(spaceId);
  let guard = 0;
  while (current && current.parentSpaceId && guard < 50) {
    current = spaceById.get(current.parentSpaceId);
    guard += 1;
  }
  return current?.id ?? null;
}

export function collectDescendantSpaces(spaces: FacilitySpace[], rootId: string) {
  const byParent = new Map<string | null, FacilitySpace[]>();
  for (const space of spaces) {
    const list = byParent.get(space.parentSpaceId) ?? [];
    list.push(space);
    byParent.set(space.parentSpaceId, list);
  }

  const results: FacilitySpace[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }
    const children = byParent.get(currentId) ?? [];
    for (const child of children) {
      results.push(child);
      if (child.id !== rootId) {
        stack.push(child.id);
      }
    }
  }

  return results;
}

export function formatFacilityLocation(facility: FacilitySpace | null, selectedSpaces: FacilitySpace[]) {
  if (!facility || selectedSpaces.length === 0) {
    return "";
  }
  const names = selectedSpaces.map((space) => space.name).slice(0, 4);
  const suffix = selectedSpaces.length > 4 ? ` +${selectedSpaces.length - 4}` : "";
  return `${facility.name} — ${names.join(", ")}${suffix}`;
}

export function computeFacilityConflicts(input: {
  readModel: CalendarReadModel;
  facilityReadModel: FacilityReservationReadModel;
  selections: FacilityBookingSelection[];
  windows: FacilityBookingWindow[];
  spaceById: Map<string, FacilitySpace>;
  ignoreOccurrenceId?: string | null;
}) {
  const conflicts: FacilityBookingConflict[] = [];
  const conflictsBySpaceId = new Set<string>();
  const conflictsByWindow = new Map<string, number>();

  const allocationsBySpace = new Map<string, typeof input.readModel.allocations>();
  for (const allocation of input.readModel.allocations) {
    if (!allocation.isActive) {
      continue;
    }
    const list = allocationsBySpace.get(allocation.spaceId) ?? [];
    list.push(allocation);
    allocationsBySpace.set(allocation.spaceId, list);
  }

  const reservationsBySpace = new Map<string, typeof input.facilityReadModel.reservations>();
  for (const reservation of input.facilityReadModel.reservations) {
    if (reservation.status !== "pending" && reservation.status !== "approved") {
      continue;
    }
    const list = reservationsBySpace.get(reservation.spaceId) ?? [];
    list.push(reservation);
    reservationsBySpace.set(reservation.spaceId, list);
  }

  for (const window of input.windows) {
    const label = window.label ?? window.occurrenceId ?? "draft";
    for (const selection of input.selections) {
      const space = input.spaceById.get(selection.spaceId);
      if (!space) {
        continue;
      }
      const allocationList = allocationsBySpace.get(selection.spaceId) ?? [];
      for (const allocation of allocationList) {
        if (input.ignoreOccurrenceId && allocation.occurrenceId === input.ignoreOccurrenceId) {
          continue;
        }
        if (!overlaps(window.startsAtUtc, window.endsAtUtc, allocation.startsAtUtc, allocation.endsAtUtc)) {
          continue;
        }
        conflicts.push({
          spaceId: selection.spaceId,
          spaceName: space.name,
          occurrenceId: window.occurrenceId,
          occurrenceLabel: label,
          conflictType: "allocation",
          conflictId: allocation.id,
          conflictStartsAtUtc: allocation.startsAtUtc,
          conflictEndsAtUtc: allocation.endsAtUtc
        });
        conflictsBySpaceId.add(selection.spaceId);
        conflictsByWindow.set(label, (conflictsByWindow.get(label) ?? 0) + 1);
      }

      const reservationList = reservationsBySpace.get(selection.spaceId) ?? [];
      for (const reservation of reservationList) {
        if (!overlaps(window.startsAtUtc, window.endsAtUtc, reservation.startsAtUtc, reservation.endsAtUtc)) {
          continue;
        }
        conflicts.push({
          spaceId: selection.spaceId,
          spaceName: space.name,
          occurrenceId: window.occurrenceId,
          occurrenceLabel: label,
          conflictType: "reservation",
          conflictId: reservation.id,
          conflictStartsAtUtc: reservation.startsAtUtc,
          conflictEndsAtUtc: reservation.endsAtUtc,
          conflictStatus: reservation.status
        });
        conflictsBySpaceId.add(selection.spaceId);
        conflictsByWindow.set(label, (conflictsByWindow.get(label) ?? 0) + 1);
      }
    }
  }

  return {
    conflicts,
    conflictsBySpaceId,
    conflictsByWindow,
    hasBlockingConflicts: input.windows.length <= 1 && conflicts.length > 0
  };
}
