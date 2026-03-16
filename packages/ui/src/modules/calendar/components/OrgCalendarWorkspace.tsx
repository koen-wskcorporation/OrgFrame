"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Panel } from "@orgframe/ui/ui/panel";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceStatusAction,
  updateOccurrenceAction
} from "@/modules/calendar/actions";
import type {
  CalendarEntry,
  CalendarEntryType,
  CalendarOccurrence,
  CalendarReadModel,
  CalendarVisibility,
  OccurrenceTeamInvite
} from "@/modules/calendar/types";
import {
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@orgframe/ui/modules/calendar/components/workspace-utils";

type OrgCalendarWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

export function OrgCalendarWorkspace({ orgSlug, canWrite, initialReadModel, activeTeams }: OrgCalendarWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [entryTypeFilter, setEntryTypeFilter] = useState<"all" | CalendarEntryType>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | CalendarVisibility>("all");
  const [quickEntryType, setQuickEntryType] = useState<CalendarEntryType>("event");
  const [quickHostTeamId, setQuickHostTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [inviteTeamId, setInviteTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const optimisticIdRef = useRef(0);
  const pendingOccurrenceUpdatesRef = useRef(new Map<string, { startsAtUtc: string; endsAtUtc: string; timezone: string }>());
  const [, startSaving] = useTransition();

  const selectedOccurrence = useMemo(() => (selectedOccurrenceId ? findOccurrence(readModel, selectedOccurrenceId) : null), [readModel, selectedOccurrenceId]);
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(readModel, selectedOccurrence) : null),
    [readModel, selectedOccurrence]
  );
  const selectedInvites = useMemo(
    () => (selectedOccurrence ? readModel.invites.filter((item) => item.occurrenceId === selectedOccurrence.id) : []),
    [readModel.invites, selectedOccurrence]
  );

  const calendarItems = useMemo(
    () =>
      toCalendarItems(readModel, {
        visibility: visibilityFilter === "all" ? undefined : visibilityFilter,
        entryTypes: entryTypeFilter === "all" ? undefined : [entryTypeFilter]
      }),
    [entryTypeFilter, readModel, visibilityFilter]
  );

  function resolveOrgId(model: CalendarReadModel) {
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.invites[0]?.orgId ?? "";
  }

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function isOptimisticId(value: string) {
    return value.startsWith("optimistic-");
  }

  function removeOptimistic(optimisticEntryId: string, optimisticOccurrenceId: string) {
    pendingOccurrenceUpdatesRef.current.delete(optimisticOccurrenceId);
    setReadModel((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== optimisticEntryId),
      occurrences: current.occurrences.filter((occurrence) => occurrence.id !== optimisticOccurrenceId),
      invites: current.invites.filter((invite) => invite.occurrenceId !== optimisticOccurrenceId),
      allocations: current.allocations.filter((allocation) => allocation.occurrenceId !== optimisticOccurrenceId)
    }));
    setSelectedOccurrenceId((current) => (current === optimisticOccurrenceId ? null : current));
  }

  function upsertInviteOptimistically(input: {
    occurrenceId: string;
    teamId: string;
    role: OccurrenceTeamInvite["role"];
    inviteStatus: OccurrenceTeamInvite["inviteStatus"];
    invitedAt?: string | null;
    respondedAt?: string | null;
  }) {
    const now = new Date().toISOString();
    setReadModel((current) => {
      const existing = current.invites.find((invite) => invite.occurrenceId === input.occurrenceId && invite.teamId === input.teamId);
      if (existing) {
        return {
          ...current,
          invites: current.invites.map((invite) =>
            invite.occurrenceId === input.occurrenceId && invite.teamId === input.teamId
              ? {
                  ...invite,
                  role: input.role,
                  inviteStatus: input.inviteStatus,
                  invitedAt: input.invitedAt ?? invite.invitedAt,
                  respondedAt: input.respondedAt ?? invite.respondedAt,
                  updatedAt: now
                }
              : invite
          )
        };
      }

      const optimisticInvite: OccurrenceTeamInvite = {
        id: buildOptimisticId("optimistic-invite"),
        orgId: resolveOrgId(current),
        occurrenceId: input.occurrenceId,
        teamId: input.teamId,
        role: input.role,
        inviteStatus: input.inviteStatus,
        invitedByUserId: null,
        invitedAt: input.invitedAt ?? now,
        respondedByUserId: null,
        respondedAt: input.respondedAt ?? null,
        createdAt: now,
        updatedAt: now
      };

      return {
        ...current,
        invites: [...current.invites, optimisticInvite]
      };
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
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      entryType: quickEntryType,
      title: draft.title,
      summary: "",
      visibility: quickEntryType === "practice" ? "internal" : "published",
      status: "scheduled",
      hostTeamId: quickEntryType === "practice" ? quickHostTeamId || null : null,
      defaultTimezone: timezone,
      settingsJson: {},
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    const optimisticOccurrence: CalendarOccurrence = {
      id: optimisticOccurrenceId,
      orgId: resolveOrgId(readModel),
      entryId: optimisticEntryId,
      sourceRuleId: null,
      sourceType: "single",
      sourceKey: `optimistic:${optimisticOccurrenceId}`,
      timezone,
      localDate: startParts.localDate,
      localStartTime: startParts.localTime,
      localEndTime: endParts.localTime,
      startsAtUtc: draft.startsAtUtc,
      endsAtUtc: draft.endsAtUtc,
      status: "scheduled",
      metadataJson: {
        createdVia: "quick_add",
        optimistic: true
      },
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    pendingOccurrenceUpdatesRef.current.set(optimisticOccurrenceId, {
      startsAtUtc: draft.startsAtUtc,
      endsAtUtc: draft.endsAtUtc,
      timezone
    });

    setReadModel((current) => ({
      ...current,
      entries: [...current.entries, optimisticEntry],
      occurrences: [...current.occurrences, optimisticOccurrence]
    }));
    setSelectedOccurrenceId(optimisticOccurrenceId);

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
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Unable to create entry",
          description: entryResult.error,
          variant: "destructive"
        });
        return;
      }

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
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Unable to create occurrence",
          description: occurrenceResult.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      setReadModel((current) =>
        replaceOptimisticIds(current, {
          entryId: { from: optimisticEntryId, to: entryResult.data.entryId },
          occurrenceId: { from: optimisticOccurrenceId, to: occurrenceResult.data.occurrenceId }
        })
      );
      setSelectedOccurrenceId((current) => (current === optimisticOccurrenceId ? occurrenceResult.data.occurrenceId : current));

      const pending = pendingOccurrenceUpdatesRef.current.get(optimisticOccurrenceId);
      pendingOccurrenceUpdatesRef.current.delete(optimisticOccurrenceId);
      if (pending && (pending.startsAtUtc !== draft.startsAtUtc || pending.endsAtUtc !== draft.endsAtUtc)) {
        const updatedStartParts = toLocalParts(pending.startsAtUtc, pending.timezone);
        const updatedEndParts = toLocalParts(pending.endsAtUtc, pending.timezone);
        const updateResult = await updateOccurrenceAction({
          orgSlug,
          occurrenceId: occurrenceResult.data.occurrenceId,
          entryId: entryResult.data.entryId,
          timezone: pending.timezone,
          localDate: updatedStartParts.localDate,
          localStartTime: updatedStartParts.localTime,
          localEndTime: updatedEndParts.localTime,
          metadataJson: {
            ...optimisticOccurrence.metadataJson,
            movedAt: new Date().toISOString()
          }
        });

        if (!updateResult.ok) {
          toast({
            title: "Unable to sync occurrence update",
            description: updateResult.error,
            variant: "destructive"
          });
          refreshWorkspace();
          return;
        }
      }

      refreshWorkspace("Calendar item created");
    });
  }

  function moveOccurrence(itemId: string, startsAtUtc: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) {
      return;
    }

    const startParts = toLocalParts(startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
    const now = new Date().toISOString();

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((item) =>
        item.id === occurrence.id
          ? {
              ...item,
              startsAtUtc,
              endsAtUtc,
              localDate: startParts.localDate,
              localStartTime: startParts.localTime,
              localEndTime: endParts.localTime,
              updatedAt: now
            }
          : item
      )
    }));

    if (isOptimisticId(occurrence.id)) {
      pendingOccurrenceUpdatesRef.current.set(occurrence.id, { startsAtUtc, endsAtUtc, timezone: occurrence.timezone });
      return;
    }

    startSaving(async () => {
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
        refreshWorkspace();
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

    const startParts = toLocalParts(occurrence.startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
    const now = new Date().toISOString();

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((item) =>
        item.id === occurrence.id
          ? {
              ...item,
              endsAtUtc,
              localDate: startParts.localDate,
              localStartTime: startParts.localTime,
              localEndTime: endParts.localTime,
              updatedAt: now
            }
          : item
      )
    }));

    if (isOptimisticId(occurrence.id)) {
      pendingOccurrenceUpdatesRef.current.set(occurrence.id, { startsAtUtc: occurrence.startsAtUtc, endsAtUtc, timezone: occurrence.timezone });
      return;
    }

    startSaving(async () => {
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
        refreshWorkspace();
        return;
      }

      refreshWorkspace("Occurrence updated");
    });
  }

  const eventPanelOpen = Boolean(selectedOccurrence && selectedEntry);
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry ? `${selectedEntry.entryType} · ${selectedOccurrence.status}` : "Select a calendar item to manage invites and status.";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Calendar Workspace</CardTitle>
        <CardDescription>Unified events, practices, and games with drag-create, drag-move, and resize actions.</CardDescription>
      </CardHeader>
      <UnifiedCalendar
        canEdit={canWrite}
        disableHoverGhost={Boolean(selectedOccurrenceId)}
        framed={false}
        className="min-h-0 flex-1 px-5 pb-5 md:px-6 md:pb-6"
        filterSlot={
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        }
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
      />
      <Panel
        onClose={() => setSelectedOccurrenceId(null)}
        open={eventPanelOpen}
        subtitle={eventPanelSubtitle}
        title={selectedEntry?.title ?? "Event details"}
      >
        {selectedOccurrence && selectedEntry ? (
          <div className="space-y-4">
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
                      upsertInviteOptimistically({
                        occurrenceId: selectedOccurrence.id,
                        teamId: inviteTeamId,
                        role: "participant",
                        inviteStatus: "pending",
                        invitedAt: new Date().toISOString()
                      });
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
                          refreshWorkspace();
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

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canWrite || selectedOccurrence.status === "cancelled"}
                onClick={() => {
                  setReadModel((current) => ({
                    ...current,
                    occurrences: current.occurrences.map((occurrence) =>
                      occurrence.id === selectedOccurrence.id ? { ...occurrence, status: "cancelled", updatedAt: new Date().toISOString() } : occurrence
                    )
                  }));
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
                      refreshWorkspace();
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
                  setReadModel((current) => ({
                    ...current,
                    occurrences: current.occurrences.map((occurrence) =>
                      occurrence.id === selectedOccurrence.id ? { ...occurrence, status: "scheduled", updatedAt: new Date().toISOString() } : occurrence
                    )
                  }));
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
                      refreshWorkspace();
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
          </div>
        ) : null}
      </Panel>
    </Card>
  );
}
