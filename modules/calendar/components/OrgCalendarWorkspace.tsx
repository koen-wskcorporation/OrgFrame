"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@/modules/calendar/components/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setOccurrenceStatusAction,
  updateOccurrenceAction
} from "@/modules/calendar/actions";
import type { CalendarReadModel, CalendarVisibility, CalendarEntryType } from "@/modules/calendar/types";
import { findEntryForOccurrence, findOccurrence, toCalendarItems, toLocalParts } from "@/modules/calendar/components/workspace-utils";
import { getFacilityBookingMapSnapshotAction } from "@/modules/facilities/actions";
import { FacilityBookingMapPanel } from "@/modules/facilities/booking/FacilityBookingMapPanel";
import type { FacilityBookingMapSnapshot } from "@/modules/facilities/types";

type OrgCalendarWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

function formatOccurrenceMeta(startsAtUtc: string, endsAtUtc: string) {
  const start = new Date(startsAtUtc);
  const end = new Date(endsAtUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(start);
  const startTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(start);
  const endTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(end);

  return `${dateLabel} • ${startTime} to ${endTime}`;
}

export function OrgCalendarWorkspace({ orgSlug, canWrite, initialReadModel, activeTeams }: OrgCalendarWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [entryTypeFilter, setEntryTypeFilter] = useState<"all" | CalendarEntryType>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | CalendarVisibility>("all");
  const [quickEntryType, setQuickEntryType] = useState<CalendarEntryType>("event");
  const [quickHostTeamId, setQuickHostTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [inviteTeamId, setInviteTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [bookingPanelOpen, setBookingPanelOpen] = useState(false);
  const [bookingSnapshot, setBookingSnapshot] = useState<FacilityBookingMapSnapshot | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isLoadingBookingSnapshot, startLoadingBookingSnapshot] = useTransition();

  const selectedOccurrence = useMemo(() => (selectedOccurrenceId ? findOccurrence(readModel, selectedOccurrenceId) : null), [readModel, selectedOccurrenceId]);
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(readModel, selectedOccurrence) : null),
    [readModel, selectedOccurrence]
  );
  const selectedInvites = useMemo(
    () => (selectedOccurrence ? readModel.invites.filter((item) => item.occurrenceId === selectedOccurrence.id) : []),
    [readModel.invites, selectedOccurrence]
  );
  const selectedOccurrenceNodeIds = useMemo(
    () => (selectedOccurrence ? readModel.allocations.filter((item) => item.occurrenceId === selectedOccurrence.id).map((item) => item.nodeId) : []),
    [readModel.allocations, selectedOccurrence]
  );
  const selectedOccurrenceNodeLabels = useMemo(() => {
    if (!selectedOccurrence || !bookingSnapshot || bookingSnapshot.occurrenceId !== selectedOccurrence.id) {
      return [];
    }
    const selected = new Set(bookingSnapshot.selectedNodeIds);
    return bookingSnapshot.nodes.filter((node) => selected.has(node.id)).map((node) => node.name);
  }, [bookingSnapshot, selectedOccurrence]);

  useEffect(() => {
    setBookingPanelOpen(false);
    setBookingSnapshot(null);
  }, [selectedOccurrenceId]);

  const calendarItems = useMemo(
    () =>
      toCalendarItems(readModel, {
        visibility: visibilityFilter === "all" ? undefined : visibilityFilter,
        entryTypes: entryTypeFilter === "all" ? undefined : [entryTypeFilter]
      }),
    [entryTypeFilter, readModel, visibilityFilter]
  );

  function hasDraftConflict(draft: UnifiedCalendarQuickAddDraft) {
    const newStart = new Date(draft.startsAtUtc).getTime();
    const newEnd = new Date(draft.endsAtUtc).getTime();
    return calendarItems.some((item) => {
      const start = new Date(item.startsAtUtc).getTime();
      const end = new Date(item.endsAtUtc).getTime();
      return newStart < end && newEnd > start;
    });
  }

  function refreshWorkspace(successTitle?: string) {
    startSaving(async () => {
      const result = await getCalendarWorkspaceDataAction({ orgSlug });
      if (!result.ok) {
        toast({
          title: "Unable to refresh calendar",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setReadModel(result.data.readModel);
      if (successTitle) {
        toast({
          title: successTitle,
          variant: "success"
        });
      }
    });
  }

  function createFromDraft(draft: UnifiedCalendarQuickAddDraft) {
    if (hasDraftConflict(draft)) {
      toast.warning({
        title: "Schedule Conflict",
        description: "This time overlaps an existing item.",
        entityKind: "booking",
        sticky: true,
        primaryAction: {
          label: "View Conflict",
          onClick: () => {
            setSelectedOccurrenceId(calendarItems[0]?.id ?? null);
          },
          closeOnClick: false
        },
        secondaryAction: {
          label: "Change Field",
          closeOnClick: false
        }
      });
      return;
    }

    startSaving(async () => {
      const entryResult = await createCalendarEntryAction({
        orgSlug,
        entryType: quickEntryType,
        title: draft.title,
        summary: "",
        visibility: quickEntryType === "practice" ? "internal" : "published",
        status: "scheduled",
        hostTeamId: quickEntryType === "practice" ? quickHostTeamId || null : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: ""
      });

      if (!entryResult.ok) {
        toast({
          title: "Unable to create entry",
          description: entryResult.error,
          variant: "destructive"
        });
        return;
      }

      const start = new Date(draft.startsAtUtc);
      const end = new Date(draft.endsAtUtc);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startParts = toLocalParts(start.toISOString(), timezone);
      const endParts = toLocalParts(end.toISOString(), timezone);

      const occurrenceResult = await createManualOccurrenceAction({
        orgSlug,
        entryId: entryResult.data.entryId,
        timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: {
          createdVia: "quick_add"
        }
      });

      if (!occurrenceResult.ok) {
        toast({
          title: "Unable to create occurrence",
          description: occurrenceResult.error,
          variant: "destructive"
        });
        return;
      }

      toast.success({
        title: "Event Created",
        description: `${draft.title} added`,
        meta: formatOccurrenceMeta(draft.startsAtUtc, draft.endsAtUtc),
        entityKind: "event",
        primaryAction: {
          label: "View Event",
          onClick: () => {
            setSelectedOccurrenceId(occurrenceResult.data.occurrenceId);
          },
          closeOnClick: false
        }
      });
      refreshWorkspace();
    });
  }

  function moveOccurrence(itemId: string, startsAtUtc: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) {
      return;
    }

    startSaving(async () => {
      const startParts = toLocalParts(startsAtUtc, occurrence.timezone);
      const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
      const result = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: occurrence.id,
        entryId: occurrence.entryId,
        timezone: occurrence.timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: {
          ...occurrence.metadataJson,
          movedAt: new Date().toISOString()
        }
      });

      if (!result.ok) {
        toast({
          title: "Unable to move occurrence",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace("Occurrence moved");
    });
  }

  function resizeOccurrence(itemId: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) {
      return;
    }

    startSaving(async () => {
      const startParts = toLocalParts(occurrence.startsAtUtc, occurrence.timezone);
      const endParts = toLocalParts(endsAtUtc, occurrence.timezone);

      const result = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: occurrence.id,
        entryId: occurrence.entryId,
        timezone: occurrence.timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: {
          ...occurrence.metadataJson,
          resizedAt: new Date().toISOString()
        }
      });

      if (!result.ok) {
        toast({
          title: "Unable to resize occurrence",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace("Occurrence updated");
    });
  }

  function openFacilityBookingMap() {
    if (!selectedOccurrence) {
      return;
    }

    startLoadingBookingSnapshot(async () => {
      const result = await getFacilityBookingMapSnapshotAction({
        orgSlug,
        occurrenceId: selectedOccurrence.id
      });

      if (!result.ok) {
        toast({
          title: "Unable to load facility map",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setBookingSnapshot(result.data.snapshot);
      setBookingPanelOpen(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar Workspace</CardTitle>
        <CardDescription>Unified events, practices, and games with drag-create, drag-move, and resize actions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSaving ? <Alert variant="info">Saving calendar updates...</Alert> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <Select
            onChange={(event) => setEntryTypeFilter(event.target.value as "all" | CalendarEntryType)}
            options={[
              { label: "All types", value: "all" },
              { label: "Events", value: "event" },
              { label: "Practices", value: "practice" },
              { label: "Games", value: "game" }
            ]}
            value={entryTypeFilter}
          />
          <Select
            onChange={(event) => setVisibilityFilter(event.target.value as "all" | CalendarVisibility)}
            options={[
              { label: "All visibility", value: "all" },
              { label: "Internal", value: "internal" },
              { label: "Published", value: "published" }
            ]}
            value={visibilityFilter}
          />
          <Select
            disabled={!canWrite}
            onChange={(event) => setQuickEntryType(event.target.value as CalendarEntryType)}
            options={[
              { label: "Quick add type: Event", value: "event" },
              { label: "Quick add type: Practice", value: "practice" },
              { label: "Quick add type: Game", value: "game" }
            ]}
            value={quickEntryType}
          />
          <Select
            disabled={!canWrite || quickEntryType !== "practice"}
            onChange={(event) => setQuickHostTeamId(event.target.value)}
            options={
              activeTeams.length > 0
                ? activeTeams.map((team) => ({ label: team.label, value: team.id }))
                : [{ label: "No active teams", value: "" }]
            }
            value={quickHostTeamId}
          />
        </div>

        <UnifiedCalendar
          canEdit={canWrite}
          filterSlot={null}
          getConflictMessage={(draft) => {
            const hasOverlap = calendarItems.some((item) => {
              const start = new Date(item.startsAtUtc).getTime();
              const end = new Date(item.endsAtUtc).getTime();
              const newStart = new Date(draft.startsAtUtc).getTime();
              const newEnd = new Date(draft.endsAtUtc).getTime();
              return newStart < end && newEnd > start;
            });
            return hasOverlap ? "This time overlaps an existing item." : null;
          }}
          items={calendarItems}
          onCreateRange={(range) =>
            createFromDraft({
              title: `New ${quickEntryType}`,
              startsAtUtc: range.startsAtUtc,
              endsAtUtc: range.endsAtUtc
            })
          }
          onMoveItem={(input) => moveOccurrence(input.itemId, input.startsAtUtc, input.endsAtUtc)}
          onQuickAdd={createFromDraft}
          onResizeItem={(input) => resizeOccurrence(input.itemId, input.endsAtUtc)}
          onSelectItem={setSelectedOccurrenceId}
          sidePanelSlot={
            selectedOccurrence && selectedEntry ? (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedEntry.title}</CardTitle>
                  <CardDescription>
                    {selectedEntry.entryType} · {selectedOccurrence.status}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-text-muted">
                    {new Date(selectedOccurrence.startsAtUtc).toLocaleString()} - {new Date(selectedOccurrence.endsAtUtc).toLocaleString()}
                  </p>

                  {selectedEntry.entryType === "practice" ? (
                    <div className="space-y-2 rounded-control border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Invite team</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          onChange={(event) => setInviteTeamId(event.target.value)}
                          options={activeTeams.map((team) => ({ label: team.label, value: team.id }))}
                          value={inviteTeamId}
                        />
                        <Button
                          disabled={!canWrite || !inviteTeamId}
                          onClick={() => {
                            startSaving(async () => {
                              const result = await inviteTeamToOccurrenceAction({
                                orgSlug,
                                occurrenceId: selectedOccurrence.id,
                                teamId: inviteTeamId
                              });

                              if (!result.ok) {
                                toast({
                                  title: "Unable to invite team",
                                  description: result.error,
                                  variant: "destructive"
                                });
                                return;
                              }

                              refreshWorkspace("Invite sent");
                            });
                          }}
                          size="sm"
                          type="button"
                        >
                          Send invite
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Teams</p>
                    {selectedInvites.length === 0 ? <p className="text-sm text-text-muted">No team participants.</p> : null}
                    {selectedInvites.map((invite) => (
                      <div className="rounded-control border bg-surface px-2 py-1 text-xs" key={invite.id}>
                        {invite.teamId} · {invite.role} · {invite.inviteStatus}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 rounded-control border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Facility spaces</p>
                    <p className="text-sm text-text-muted">
                      {selectedOccurrenceNodeIds.length > 0
                        ? `${selectedOccurrenceNodeIds.length} selected`
                        : "No spaces selected for this occurrence."}
                    </p>
                    {selectedOccurrenceNodeLabels.length > 0 ? (
                      <p className="text-xs text-text-muted">{selectedOccurrenceNodeLabels.join(", ")}</p>
                    ) : null}
                    <Button
                      disabled={!canWrite || isLoadingBookingSnapshot}
                      onClick={openFacilityBookingMap}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {isLoadingBookingSnapshot ? "Loading map..." : "Select spaces on map"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!canWrite || selectedOccurrence.status === "cancelled"}
                      onClick={() => {
                        startSaving(async () => {
                          const result = await setOccurrenceStatusAction({
                            orgSlug,
                            occurrenceId: selectedOccurrence.id,
                            status: "cancelled"
                          });

                          if (!result.ok) {
                            toast({
                              title: "Unable to cancel occurrence",
                              description: result.error,
                              variant: "destructive"
                            });
                            return;
                          }

                          refreshWorkspace("Occurrence cancelled");
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel occurrence
                    </Button>
                    <Button
                      disabled={!canWrite || selectedOccurrence.status === "scheduled"}
                      onClick={() => {
                        startSaving(async () => {
                          const result = await setOccurrenceStatusAction({
                            orgSlug,
                            occurrenceId: selectedOccurrence.id,
                            status: "scheduled"
                          });

                          if (!result.ok) {
                            toast({
                              title: "Unable to restore occurrence",
                              description: result.error,
                              variant: "destructive"
                            });
                            return;
                          }

                          refreshWorkspace("Occurrence restored");
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Restore occurrence
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                  <CardDescription>Select a calendar item to manage invites and status.</CardDescription>
                </CardHeader>
              </Card>
            )
          }
        />
        {selectedOccurrence && bookingSnapshot ? (
          <FacilityBookingMapPanel
            canWrite={canWrite}
            facilities={bookingSnapshot.facilities}
            nodes={bookingSnapshot.nodes}
            onClose={() => setBookingPanelOpen(false)}
            onConfirm={(input) => {
              startSaving(async () => {
                const result = await setOccurrenceFacilityAllocationsAction({
                  orgSlug,
                  occurrenceId: selectedOccurrence.id,
                  facilityId: input.facilityId,
                  nodeIds: input.nodeIds
                });

                if (!result.ok) {
                  toast.warning({
                    title: "Schedule Conflict",
                    description: result.error,
                    entityKind: "booking",
                    sticky: true,
                    primaryAction: {
                      label: "View Conflict",
                      onClick: () => {
                        setBookingPanelOpen(true);
                      },
                      closeOnClick: false
                    },
                    secondaryAction: {
                      label: "Change Field",
                      onClick: () => {
                        setBookingPanelOpen(true);
                      },
                      closeOnClick: false
                    }
                  });
                  return;
                }

                setBookingPanelOpen(false);
                setBookingSnapshot(null);
                toast.success({
                  title: "Field Booked",
                  description: input.nodeIds.length === 1 ? "1 space reserved" : `${input.nodeIds.length} spaces reserved`,
                  meta: formatOccurrenceMeta(selectedOccurrence.startsAtUtc, selectedOccurrence.endsAtUtc),
                  entityKind: "booking",
                  primaryAction: {
                    label: "View Booking",
                    onClick: () => {
                      setSelectedOccurrenceId(selectedOccurrence.id);
                      setBookingPanelOpen(true);
                    },
                    closeOnClick: false
                  }
                });
                refreshWorkspace();
              });
            }}
            open={bookingPanelOpen}
            selectedNodeIds={bookingSnapshot.selectedNodeIds}
            unavailableNodeIds={bookingSnapshot.unavailableNodeIds}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
