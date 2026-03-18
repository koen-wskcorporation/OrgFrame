"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { Chip } from "@orgframe/ui/ui/chip";
import { Select } from "@orgframe/ui/ui/select";
import { Textarea } from "@orgframe/ui/ui/textarea";
import { Popup } from "@orgframe/ui/ui/popup";
import type { CanvasViewportHandle } from "@orgframe/ui/ui/canvas-viewport";
import type { CalendarReadModel, FacilitySpaceConfiguration } from "@/modules/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/modules/facilities/types";
import { cn } from "@/lib/utils";
import { StructureCanvas } from "@orgframe/ui/modules/core/components/StructureCanvas";
import {
  buildSpaceById,
  collectDescendantSpaces,
  computeFacilityConflicts,
  type FacilityBookingSelection,
  type FacilityBookingWindow
} from "@orgframe/ui/modules/calendar/components/facility-booking-utils";

type FacilityBookingDialogProps = {
  open: boolean;
  onClose: () => void;
  facilityId: string | null;
  spaces: FacilitySpace[];
  configurations: FacilitySpaceConfiguration[];
  calendarReadModel: CalendarReadModel;
  facilityReadModel: FacilityReservationReadModel;
  selections: FacilityBookingSelection[];
  onSelectionsChange: (next: FacilityBookingSelection[]) => void;
  occurrenceWindows: FacilityBookingWindow[];
  ignoreOccurrenceId?: string | null;
  allowPartialConflicts?: boolean;
  saveLabel?: string;
  onSave: () => void;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function hasFloorPlan(space: FacilitySpace) {
  const metadata = asObject(space.metadataJson);
  const floorPlan = asObject(metadata.floorPlan);
  return ["x", "y", "width", "height"].every((key) => typeof floorPlan[key] === "number");
}

function resolveStatusChip(space: FacilitySpace) {
  if (space.status === "archived") {
    return { label: "archived", color: "red" as const };
  }
  if (space.status === "closed") {
    return { label: "closed", color: "yellow" as const };
  }
  if (!space.isBookable) {
    return { label: "not bookable", color: "neutral" as const };
  }
  return { label: "open", color: "green" as const };
}

export function FacilityBookingDialog({
  open,
  onClose,
  facilityId,
  spaces,
  configurations,
  calendarReadModel,
  facilityReadModel,
  selections,
  onSelectionsChange,
  occurrenceWindows,
  ignoreOccurrenceId,
  allowPartialConflicts = false,
  saveLabel = "Apply booking",
  onSave
}: FacilityBookingDialogProps) {
  const spaceById = useMemo(() => buildSpaceById(spaces), [spaces]);
  const facility = facilityId ? spaceById.get(facilityId) ?? null : null;
  const facilitySpaces = useMemo(() => (facilityId ? collectDescendantSpaces(spaces, facilityId) : []), [facilityId, spaces]);
  const canvasRef = useRef<CanvasViewportHandle | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [searchQuery, setSearchQuery] = useState("");

  const selectableSpaces = facilitySpaces.filter((space) => space.status !== "archived");
  const spacesWithLayout = selectableSpaces.filter((space) => hasFloorPlan(space));
  const hasMapLayout = spacesWithLayout.length > 0;

  const selectedIds = useMemo(() => new Set(selections.map((selection) => selection.spaceId)), [selections]);

  const conflicts = useMemo(
    () =>
      computeFacilityConflicts({
        readModel: calendarReadModel,
        facilityReadModel,
        selections,
        windows: occurrenceWindows,
        spaceById,
        ignoreOccurrenceId
      }),
    [calendarReadModel, facilityReadModel, selections, occurrenceWindows, spaceById, ignoreOccurrenceId]
  );

  const conflictedSpaceIds = conflicts.conflictsBySpaceId;
  const saveDisabled = conflicts.hasBlockingConflicts && !allowPartialConflicts;

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  function toggleSpace(space: FacilitySpace) {
    const selectable = space.status === "open" && space.isBookable;
    if (!selectable) {
      return;
    }
    if (selectedIds.has(space.id)) {
      onSelectionsChange(selections.filter((selection) => selection.spaceId !== space.id));
      return;
    }

    const configOptions = configurations.filter((config) => config.spaceId === space.id && config.isActive);
    const defaultConfig = configOptions.sort((a, b) => a.sortIndex - b.sortIndex)[0];
    onSelectionsChange([
      ...selections,
      {
        spaceId: space.id,
        configurationId: defaultConfig?.id,
        lockMode: "exclusive",
        allowShared: false,
        notes: ""
      }
    ]);
  }

  function updateSelection(spaceId: string, patch: Partial<FacilityBookingSelection>) {
    onSelectionsChange(
      selections.map((selection) => (selection.spaceId === spaceId ? { ...selection, ...patch } : selection))
    );
  }

  function removeSelection(spaceId: string) {
    onSelectionsChange(selections.filter((selection) => selection.spaceId !== spaceId));
  }

  const filteredSpaces =
    searchQuery.trim().length > 0
      ? selectableSpaces.filter((space) => space.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : selectableSpaces;

  return (
    <Popup
      closeOnBackdrop={false}
      contentClassName="h-full p-4 md:p-5"
      onClose={onClose}
      open={open}
      size="full"
      title={facility ? `Book ${facility.name}` : "Book facility spaces"}
      subtitle="Select one or more spaces, adjust configuration and lock mode, then confirm."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-muted">
            {saveDisabled ? "Resolve conflicts to save this booking." : allowPartialConflicts && conflicts.conflicts.length > 0 ? "Some occurrences will skip conflicting spaces." : " "}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={saveDisabled} onClick={onSave} type="button">
              {saveLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid h-full min-h-[520px] gap-4 md:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
        {hasMapLayout ? (
          <StructureCanvas
            addButtonDisabled
            autoFitKey={open ? `${facilityId ?? "none"}:${spacesWithLayout.length}` : "closed"}
            autoFitOnOpen
            canvasRef={canvasRef}
            canvasContentClassName="p-0"
            canvasGridColor="hsl(var(--border) / 0.55)"
            canvasGridSize={25}
            canvasLayoutMode="free"
            facilityConflictedIds={conflictedSpaceIds}
            facilityRootId={facilityId}
            facilitySelectedIds={selectedIds}
            facilitySpaces={spaces}
            mapMode="facility"
            onFacilitySelect={toggleSpace}
            onSearchQueryChange={setSearchQuery}
            onViewScaleChange={(scale) => setZoomPercent(Math.round(scale * 100))}
            persistViewState={false}
            respectGlobalPanels={false}
            rootHeader={null}
            searchQuery={searchQuery}
            showEditButton={false}
            storageKey={`calendar-booking-map:${facilityId ?? "none"}`}
            viewContentInteractive
            viewHeightMode="fill"
            viewViewportInteractive
            zoomPercent={zoomPercent}
          />
        ) : (
          <div className="flex min-h-[380px] items-center justify-center rounded-control border bg-surface p-6">
            <p className="text-sm text-text-muted">No facility map layout available. Use the list to select spaces.</p>
          </div>
        )}

        <div className="flex min-h-0 h-full flex-col gap-4 overflow-y-auto">
          {!hasMapLayout ? (
            <div className="rounded-control border bg-surface p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Spaces</p>
              <div className="mt-2 space-y-2">
                {filteredSpaces.map((space) => {
                  const isSelected = selectedIds.has(space.id);
                  const selectable = space.status === "open" && space.isBookable;
                  const statusChip = resolveStatusChip(space);
                  return (
                    <button
                      className={cn(
                        "flex w-full items-center justify-between rounded-control border px-2 py-2 text-left text-sm transition-colors",
                        isSelected ? "border-accent bg-accent/10" : "border-border bg-surface",
                        selectable ? "hover:bg-surface-muted" : "cursor-not-allowed opacity-60"
                      )}
                      disabled={!selectable}
                      key={space.id}
                      onClick={() => toggleSpace(space)}
                      type="button"
                    >
                      <span>
                        <span className="font-semibold">{space.name}</span>
                        <span className="ml-2 text-xs text-text-muted">{space.spaceKind}</span>
                      </span>
                      <Chip color={statusChip.color} size="compact" variant="flat">
                        {statusChip.label}
                      </Chip>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-control border bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Selected spaces</p>
              <p className="text-xs text-text-muted">{selections.length} selected</p>
            </div>
            {selections.length === 0 ? <p className="mt-2 text-sm text-text-muted">Select spaces from the map.</p> : null}
            <div className="mt-3 space-y-3">
              {selections.map((selection) => {
                const space = spaceById.get(selection.spaceId);
                if (!space) {
                  return null;
                }
                const configOptions = configurations.filter((config) => config.spaceId === space.id && config.isActive);
                return (
                  <div className="rounded-control border bg-surface-muted/30 p-3" key={selection.spaceId}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text">{space.name}</p>
                        <p className="text-xs text-text-muted">{space.spaceKind}</p>
                      </div>
                      <Button onClick={() => removeSelection(selection.spaceId)} size="sm" type="button" variant="ghost">
                        Remove
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Select
                        onChange={(event) => updateSelection(selection.spaceId, { configurationId: event.target.value || undefined })}
                        options={
                          configOptions.length > 0
                            ? [
                                { label: "Auto default configuration", value: "" },
                                ...configOptions.map((config) => ({ label: config.name, value: config.id }))
                              ]
                            : [{ label: "Auto default configuration", value: "" }]
                        }
                        value={selection.configurationId ?? ""}
                      />
                      <Select
                        onChange={(event) =>
                          updateSelection(selection.spaceId, { lockMode: event.target.value as FacilityBookingSelection["lockMode"] })
                        }
                        options={[
                          { label: "Exclusive booking", value: "exclusive" },
                          { label: "Shared invite only", value: "shared_invite_only" }
                        ]}
                        value={selection.lockMode ?? "exclusive"}
                      />
                      <label className="ui-inline-toggle">
                        <input
                          checked={selection.allowShared ?? false}
                          onChange={(event) => updateSelection(selection.spaceId, { allowShared: event.target.checked })}
                          type="checkbox"
                        />
                        Allow shared invites
                      </label>
                      <Textarea
                        onChange={(event) => updateSelection(selection.spaceId, { notes: event.target.value })}
                        placeholder="Optional notes"
                        rows={2}
                        value={selection.notes ?? ""}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {conflicts.conflicts.length > 0 ? (
            <Alert variant={allowPartialConflicts ? "info" : "destructive"}>
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  {allowPartialConflicts ? "Some occurrences have conflicts." : "Selected spaces are already booked."}
                </p>
                <ul className="space-y-1 text-xs text-text-muted">
                  {conflicts.conflicts.slice(0, 6).map((conflict, index) => (
                    <li key={`${conflict.conflictId}-${index}`}>
                      {conflict.spaceName} · {conflict.conflictType} · {conflict.occurrenceLabel} ·{" "}
                      {new Date(conflict.conflictStartsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} -{" "}
                      {new Date(conflict.conflictEndsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </li>
                  ))}
                </ul>
                {conflicts.conflicts.length > 6 ? (
                  <p className="text-xs text-text-muted">+{conflicts.conflicts.length - 6} more conflicts</p>
                ) : null}
              </div>
            </Alert>
          ) : null}
        </div>
      </div>
    </Popup>
  );
}
