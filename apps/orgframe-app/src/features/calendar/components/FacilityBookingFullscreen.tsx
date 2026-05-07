"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Popover } from "@orgframe/ui/primitives/popover";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Calendar } from "@/src/features/calendar/components/Calendar";
import { FacilityMapEditor } from "@/src/features/facilities/map/components/FacilityMapEditor";
import { getFacilityBookingMapAction } from "@/src/features/facilities/actions";
import { type MapShape, shapeFromSpace } from "@/src/features/facilities/map/types";
import { CANVAS_PADDING, CANVAS_MIN_NODE_SIZE } from "@/src/features/canvas/core/constants";
import { rectPoints } from "@/src/features/canvas/core/geometry";
import type { CalendarReadModel } from "@/src/features/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace, FacilitySpaceKind, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import type { FacilityBookingSelection, FacilityBookingWindow } from "@/src/features/calendar/components/facility-booking-utils";

type AvailabilityState = "free" | "partial" | "blocked";

type SpaceAvailability = {
  state: AvailabilityState;
  conflictingItems: Array<{ id: string; startsAtUtc: string; endsAtUtc: string; label: string; kind: "allocation" | "reservation" }>;
};

type FacilityBookingFullscreenProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  facilityRootId: string;
  windows: FacilityBookingWindow[];
  calendarReadModel: CalendarReadModel;
  facilityReadModel: FacilityReservationReadModel;
  selections: FacilityBookingSelection[];
  onSelectionsChange: (next: FacilityBookingSelection[]) => void;
  onSuggestWindow?: (next: { startsAtUtc: string; endsAtUtc: string }) => void;
  ignoreOccurrenceId?: string | null;
};

// Space kinds that can never be booked through this flow regardless of the
// `isBookable` flag. Bathrooms / parking-lots are circulation, not bookable.
const UNBOOKABLE_KINDS = new Set<FacilitySpaceKind>(["bathroom", "parking_lot", "lobby"]);

function isBookableKind(space: FacilitySpace) {
  if (UNBOOKABLE_KINDS.has(space.spaceKind)) {
    return false;
  }
  return space.isBookable !== false;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return "";
  }
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return `${s.toLocaleDateString([], { month: "short", day: "numeric" })} ${fmtTime(start)}–${fmtTime(end)}`;
  }
  return `${s.toLocaleDateString([], { month: "short", day: "numeric" })} → ${e.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function suggestNearbyWindows(input: {
  desiredStartUtc: string;
  desiredEndUtc: string;
  reservations: FacilityReservationReadModel["reservations"];
  allocations: CalendarReadModel["allocations"];
  spaceIds: string[];
  ignoreOccurrenceId?: string | null;
}): Array<{ startsAtUtc: string; endsAtUtc: string; label: string }> {
  const start = new Date(input.desiredStartUtc).getTime();
  const end = new Date(input.desiredEndUtc).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  const duration = end - start;

  const busy: Array<[number, number]> = [];
  const spaceIdSet = new Set(input.spaceIds);
  for (const res of input.reservations) {
    if (!spaceIdSet.has(res.spaceId)) continue;
    if (res.status !== "pending" && res.status !== "approved") continue;
    busy.push([new Date(res.startsAtUtc).getTime(), new Date(res.endsAtUtc).getTime()]);
  }
  for (const alloc of input.allocations) {
    if (!alloc.isActive) continue;
    if (!spaceIdSet.has(alloc.spaceId)) continue;
    if (input.ignoreOccurrenceId && alloc.occurrenceId === input.ignoreOccurrenceId) continue;
    busy.push([new Date(alloc.startsAtUtc).getTime(), new Date(alloc.endsAtUtc).getTime()]);
  }
  busy.sort((a, b) => a[0] - b[0]);
  function isFree(s: number, e: number) {
    for (const [bs, be] of busy) {
      if (s < be && bs < e) return false;
    }
    return true;
  }

  const suggestions: Array<{ startsAtUtc: string; endsAtUtc: string; label: string }> = [];
  const STEP = 30 * 60 * 1000;
  const MAX_STEPS = 16;
  for (let step = 1; step <= MAX_STEPS && suggestions.length < 4; step += 1) {
    for (const direction of [-1, 1] as const) {
      const candidateStart = start + direction * step * STEP;
      const candidateEnd = candidateStart + duration;
      if (isFree(candidateStart, candidateEnd)) {
        const startIso = new Date(candidateStart).toISOString();
        const endIso = new Date(candidateEnd).toISOString();
        if (suggestions.some((s) => s.startsAtUtc === startIso)) continue;
        suggestions.push({ startsAtUtc: startIso, endsAtUtc: endIso, label: fmtRange(startIso, endIso) });
        if (suggestions.length >= 4) break;
      }
    }
  }
  return suggestions;
}

function availabilityClasses(state: AvailabilityState, selected: boolean) {
  if (selected) return "border-accent bg-accent text-accent-foreground";
  if (state === "free") return "border-success/40 bg-success/10 text-success";
  if (state === "partial") return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

function availabilityLabel(state: AvailabilityState, selected: boolean) {
  if (selected) return "Selected";
  if (state === "free") return "Available";
  if (state === "partial") return "Partial conflict";
  return "Booked";
}

export function FacilityBookingFullscreen(props: FacilityBookingFullscreenProps) {
  const {
    open,
    onClose,
    orgSlug,
    facilityRootId,
    windows,
    calendarReadModel,
    facilityReadModel,
    selections,
    onSelectionsChange,
    onSuggestWindow,
    ignoreOccurrenceId
  } = props;

  const { toast } = useToast();
  const [mapData, setMapData] = React.useState<{
    orgId: string;
    spaces: FacilitySpace[];
    spaceStatuses: FacilitySpaceStatusDef[];
    geoAnchor: { lat: number; lng: number } | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [conflictPopoverSpaceId, setConflictPopoverSpaceId] = React.useState<string | null>(null);
  const conflictAnchorRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const dockRef = React.useRef<HTMLDivElement | null>(null);

  // Tell already-mounted Panels to re-resolve their portal target whenever
  // this popup mounts/unmounts. The panel-dock-changed listener in
  // packages/ui/src/primitives/panel.tsx picks the popup-panel-dock div up
  // and re-portals the wizard sidebar inside this popup.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    const fire = () => window.dispatchEvent(new Event("panel-dock-changed"));
    // Run after mount and after unmount so the panel re-portals back out.
    requestAnimationFrame(fire);
    return () => {
      requestAnimationFrame(fire);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setMapData(null);
    getFacilityBookingMapAction({ orgSlug, facilityId: facilityRootId })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          toast({ title: "Unable to load facility map", description: result.error, variant: "destructive" });
          return;
        }
        setMapData({ ...result.data, spaceStatuses: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityRootId, open, orgSlug, toast]);

  const selectedSpaceIds = React.useMemo(() => new Set(selections.map((selection) => selection.spaceId)), [selections]);

  const availabilityBySpaceId = React.useMemo(() => {
    const result = new Map<string, SpaceAvailability>();
    if (!mapData) return result;

    const allocationsBySpace = new Map<string, typeof calendarReadModel.allocations>();
    for (const allocation of calendarReadModel.allocations) {
      if (!allocation.isActive) continue;
      if (ignoreOccurrenceId && allocation.occurrenceId === ignoreOccurrenceId) continue;
      const list = allocationsBySpace.get(allocation.spaceId) ?? [];
      list.push(allocation);
      allocationsBySpace.set(allocation.spaceId, list);
    }
    const reservationsBySpace = new Map<string, typeof facilityReadModel.reservations>();
    for (const reservation of facilityReadModel.reservations) {
      if (reservation.status !== "pending" && reservation.status !== "approved") continue;
      const list = reservationsBySpace.get(reservation.spaceId) ?? [];
      list.push(reservation);
      reservationsBySpace.set(reservation.spaceId, list);
    }

    for (const space of mapData.spaces) {
      if (!isBookableKind(space)) continue;
      const conflictingItems: SpaceAvailability["conflictingItems"] = [];
      let conflictedWindows = 0;
      const allocs = allocationsBySpace.get(space.id) ?? [];
      const ress = reservationsBySpace.get(space.id) ?? [];
      for (const window of windows) {
        let windowConflicted = false;
        for (const alloc of allocs) {
          if (overlaps(window.startsAtUtc, window.endsAtUtc, alloc.startsAtUtc, alloc.endsAtUtc)) {
            windowConflicted = true;
            conflictingItems.push({
              id: alloc.id,
              startsAtUtc: alloc.startsAtUtc,
              endsAtUtc: alloc.endsAtUtc,
              label: "Calendar event",
              kind: "allocation"
            });
          }
        }
        for (const res of ress) {
          if (overlaps(window.startsAtUtc, window.endsAtUtc, res.startsAtUtc, res.endsAtUtc)) {
            windowConflicted = true;
            conflictingItems.push({
              id: res.id,
              startsAtUtc: res.startsAtUtc,
              endsAtUtc: res.endsAtUtc,
              label: "Reservation",
              kind: "reservation"
            });
          }
        }
        if (windowConflicted) conflictedWindows += 1;
      }
      const total = windows.length || 1;
      const state: AvailabilityState =
        conflictedWindows === 0 ? "free" : conflictedWindows >= total ? "blocked" : "partial";
      result.set(space.id, { state, conflictingItems });
    }
    return result;
  }, [calendarReadModel.allocations, facilityReadModel.reservations, ignoreOccurrenceId, mapData, windows]);

  function handleSpaceClick(spaceId: string) {
    const availability = availabilityBySpaceId.get(spaceId);
    const space = mapData?.spaces.find((s) => s.id === spaceId);
    if (!space || !availability || !isBookableKind(space)) {
      return;
    }
    if (availability.state === "blocked") {
      setConflictPopoverSpaceId(spaceId);
      return;
    }
    const isSelected = selectedSpaceIds.has(spaceId);
    if (isSelected) {
      onSelectionsChange(selections.filter((selection) => selection.spaceId !== spaceId));
    } else {
      onSelectionsChange([
        ...selections,
        {
          spaceId,
          configurationId: undefined,
          lockMode: "exclusive",
          allowShared: false,
          notes: ""
        }
      ]);
    }
  }

  // Inject a single status pill into each bookable space's title slot.
  // FacilityMapEditor's existing facility StatusChip is suppressed for the
  // same space (the booking pill REPLACES the open/closed badge in this
  // mode — see `replaceStatusChipBySpaceId` on FacilityMapEditor).
  const nodeBadgeBySpaceId = React.useMemo<Record<string, React.ReactNode>>(() => {
    const map: Record<string, React.ReactNode> = {};
    if (!mapData) return map;
    for (const space of mapData.spaces) {
      if (!isBookableKind(space)) continue;
      const availability = availabilityBySpaceId.get(space.id);
      if (!availability) continue;
      const isSelected = selectedSpaceIds.has(space.id);
      const state = availability.state;
      map[space.id] = (
        <button
          className={
            "pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors " +
            availabilityClasses(state, isSelected)
          }
          onClick={(event) => {
            event.stopPropagation();
            handleSpaceClick(space.id);
          }}
          ref={(node) => {
            conflictAnchorRefs.current.set(space.id, node);
          }}
          type="button"
        >
          {isSelected ? <Check className="h-3 w-3" /> : null}
          {availabilityLabel(state, isSelected)}
        </button>
      );
    }
    return map;
    // handleSpaceClick is closed-over per-render and depends on the same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityBySpaceId, mapData, selectedSpaceIds]);

  // Tell FacilityMapEditor which spaces should suppress the existing status
  // chip — i.e. every bookable space (we own the pill there now).
  const replaceStatusChipBySpaceId = React.useMemo(() => {
    const set = new Set<string>();
    if (!mapData) return set;
    for (const space of mapData.spaces) {
      if (isBookableKind(space)) set.add(space.id);
    }
    return set;
  }, [mapData]);

  // Make unbookable spaces unclickable on the polygon level too. Since the
  // editor itself dispatches selection through `onSelectNode`, we filter out
  // those node ids before forwarding.
  const unbookableNodeIds = React.useMemo(() => {
    const set = new Set<string>();
    if (!mapData) return set;
    for (const space of mapData.spaces) {
      if (!isBookableKind(space)) set.add(space.id);
    }
    return set;
  }, [mapData]);

  // Derive editor shapes from the loaded spaces. The booking flow doesn't
  // mutate geometry — this is a read-only render — so a fallback default
  // rectangle is fine for any space that hasn't been placed on the map yet.
  const bookingShapes: MapShape[] = React.useMemo(() => {
    if (!mapData) return [];
    let i = 0;
    return mapData.spaces
      .filter((s) => s.status !== "archived")
      .map((space) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        const x = CANVAS_PADDING + col * (CANVAS_MIN_NODE_SIZE * 3);
        const y = CANVAS_PADDING + row * (CANVAS_MIN_NODE_SIZE * 2);
        i++;
        return shapeFromSpace(space, {
          points: rectPoints({ x, y, width: CANVAS_MIN_NODE_SIZE * 3, height: CANVAS_MIN_NODE_SIZE * 2 }),
          zIndex: i
        });
      });
  }, [mapData]);

  const aiSuggestions = React.useMemo(() => {
    if (!mapData || windows.length === 0 || selections.length === 0) return [];
    const desired = windows[0]!;
    const anyConflict = selections.some((selection) => availabilityBySpaceId.get(selection.spaceId)?.state !== "free");
    if (!anyConflict) return [];
    return suggestNearbyWindows({
      desiredStartUtc: desired.startsAtUtc,
      desiredEndUtc: desired.endsAtUtc,
      reservations: facilityReadModel.reservations,
      allocations: calendarReadModel.allocations,
      spaceIds: selections.map((selection) => selection.spaceId),
      ignoreOccurrenceId
    });
  }, [availabilityBySpaceId, calendarReadModel.allocations, facilityReadModel.reservations, ignoreOccurrenceId, mapData, selections, windows]);

  const conflictSpace = conflictPopoverSpaceId ? mapData?.spaces.find((s) => s.id === conflictPopoverSpaceId) ?? null : null;
  const conflictAvailability = conflictPopoverSpaceId ? availabilityBySpaceId.get(conflictPopoverSpaceId) ?? null : null;
  const conflictAnchorRef = React.useMemo(() => {
    if (!conflictPopoverSpaceId) return null;
    return { current: conflictAnchorRefs.current.get(conflictPopoverSpaceId) ?? null } as React.RefObject<HTMLElement>;
  }, [conflictPopoverSpaceId]);

  const conflictDayItems = React.useMemo(() => {
    if (!conflictPopoverSpaceId || !conflictAvailability) return [];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return conflictAvailability.conflictingItems.map((item) => ({
      id: item.id,
      title: item.label,
      entryType: "event" as const,
      status: "scheduled" as const,
      startsAtUtc: item.startsAtUtc,
      endsAtUtc: item.endsAtUtc,
      timezone: tz
    }));
  }, [conflictAvailability, conflictPopoverSpaceId]);

  const headerTitle = windows.length > 0 ? fmtRange(windows[0]!.startsAtUtc, windows[0]!.endsAtUtc) : "Pick a time first";
  const headerSubtitle =
    windows.length > 1
      ? `${windows.length} occurrences`
      : selections.length === 0
        ? "Click an available space to book it."
        : `${selections.length} space${selections.length === 1 ? "" : "s"} selected`;

  return (
    <Popup
      contentClassName="!overflow-hidden"
      onClose={onClose}
      open={open}
      popupClassName="!rounded-none"
      size="full"
      subtitle={headerSubtitle}
      title={headerTitle}
    >
      <div className="flex h-full min-h-0 w-full">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {loading || !mapData ? (
            <div className="flex h-full items-center justify-center">
              <SpinnerIcon className="h-5 w-5 text-text-muted" />
            </div>
          ) : (
            <FacilityMapEditor
              aiMode={false}
              canWrite={false}
              geoAnchor={mapData.geoAnchor}
              geoShowMap={Boolean(mapData.geoAnchor)}
              indoor={!mapData.geoAnchor}
              isSaving={false}
              multiSelectedNodeIds={selectedSpaceIds}
              nodeBadgeBySpaceId={nodeBadgeBySpaceId}
              nodes={bookingShapes}
              onChangeNodes={() => undefined}
              onCreateShape={() => null}
              onDeleteNode={() => undefined}
              onEditGeoLocation={() => undefined}
              onSave={() => undefined}
              onSelectNode={(nodeId) => {
                if (!nodeId) return;
                if (unbookableNodeIds.has(nodeId)) return;
                handleSpaceClick(nodeId);
              }}
              onToggleGeoMap={() => undefined}
              readOnly
              replaceStatusChipBySpaceId={replaceStatusChipBySpaceId}
              selectedNodeId={null}
              spaceStatuses={mapData.spaceStatuses}
            />
          )}
        </div>

        {/* Wizard panel docks here. The Panel primitive picks up
            #popup-panel-dock and re-portals into it (see panel-dock-changed
            event dispatched on mount/unmount above). */}
        <div
          className="relative h-full w-[340px] shrink-0 border-l bg-canvas"
          data-panel-context="popup"
          data-popup-editor-root="true"
          id="popup-panel-dock"
          ref={dockRef}
        />
      </div>

      {conflictAnchorRef && conflictSpace && conflictAvailability ? (
        <Popover
          anchorRef={conflictAnchorRef}
          className="w-[min(calc(100vw-2rem),28rem)] max-w-none p-0"
          onClose={() => setConflictPopoverSpaceId(null)}
          open={Boolean(conflictPopoverSpaceId)}
          placement="bottom-start"
        >
          <div className="space-y-3 p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Existing bookings</p>
              <p className="text-sm font-semibold text-text">{conflictSpace.name}</p>
            </div>
            <div className="h-[18rem] overflow-hidden rounded-control border">
              <Calendar
                canEdit={false}
                framed={false}
                initialView="day"
                items={conflictDayItems}
                quickAddUx="external"
                referenceTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
              />
            </div>
            <p className="text-xs text-text-muted">
              {conflictAvailability.conflictingItems.length} conflicting{" "}
              {conflictAvailability.conflictingItems.length === 1 ? "booking" : "bookings"}. Adjust the date/time in the
              wizard or pick a suggestion below.
            </p>
          </div>
        </Popover>
      ) : null}
    </Popup>
  );
}
