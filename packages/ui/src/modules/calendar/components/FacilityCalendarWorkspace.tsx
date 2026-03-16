"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Panel } from "@orgframe/ui/ui/panel";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  assignFacilityAllocationAction,
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction
} from "@/modules/calendar/actions";
import type { CalendarEntry, CalendarOccurrence, CalendarReadModel, FacilityAllocation, OccurrenceTeamInvite } from "@/modules/calendar/types";
import {
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@orgframe/ui/modules/calendar/components/workspace-utils";

type FacilityCalendarWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  spaceId: string;
  spaceName: string;
  initialReadModel: CalendarReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

export function FacilityCalendarWorkspace({ orgSlug, canWrite, spaceId, spaceName, initialReadModel, activeTeams }: FacilityCalendarWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [hostTeamId, setHostTeamId] = useState(activeTeams[0]?.id ?? "");
  const [configurationId, setConfigurationId] = useState<string>("");
  const [inviteTeamId, setInviteTeamId] = useState(activeTeams[0]?.id ?? "");
  const optimisticIdRef = useRef(0);
  const [, startSaving] = useTransition();

  const spaceConfigurations = useMemo(
    () => readModel.configurations.filter((configuration) => configuration.spaceId === spaceId && configuration.isActive),
    [readModel.configurations, spaceId]
  );

  const filteredItems = useMemo(() => {
    const occurrenceIds = new Set(
      readModel.allocations.filter((allocation) => allocation.spaceId === spaceId && allocation.isActive).map((allocation) => allocation.occurrenceId)
    );

    const scopedReadModel: CalendarReadModel = {
      ...readModel,
      occurrences: readModel.occurrences.filter((occurrence) => occurrenceIds.has(occurrence.id))
    };

    return toCalendarItems(scopedReadModel);
  }, [readModel, spaceId]);

  const selectedOccurrence = useMemo(() => (selectedOccurrenceId ? findOccurrence(readModel, selectedOccurrenceId) : null), [readModel, selectedOccurrenceId]);
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(readModel, selectedOccurrence) : null),
    [readModel, selectedOccurrence]
  );
  const selectedAllocation = useMemo(
    () => (selectedOccurrence ? readModel.allocations.find((allocation) => allocation.occurrenceId === selectedOccurrence.id) ?? null : null),
    [readModel.allocations, selectedOccurrence]
  );

  function resolveOrgId(model: CalendarReadModel) {
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.allocations[0]?.orgId ?? "";
  }

  const eventPanelOpen = Boolean(selectedOccurrence && selectedEntry);
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry
      ? `${selectedEntry.entryType} · ${new Date(selectedOccurrence.startsAtUtc).toLocaleString()}`
      : "Select a calendar item to manage invites and configuration.";

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function removeOptimistic(optimisticEntryId: string, optimisticOccurrenceId: string, optimisticAllocationId: string) {
    setReadModel((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== optimisticEntryId),
      occurrences: current.occurrences.filter((occurrence) => occurrence.id !== optimisticOccurrenceId),
      allocations: current.allocations.filter((allocation) => allocation.id !== optimisticAllocationId)
    }));
    setSelectedOccurrenceId((current) => (current === optimisticOccurrenceId ? null : current));
  }

  function upsertInviteOptimistically(input: {
    occurrenceId: string;
    teamId: string;
    role: OccurrenceTeamInvite["role"];
    inviteStatus: OccurrenceTeamInvite["inviteStatus"];
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
        invitedAt: now,
        respondedByUserId: null,
        respondedAt: null,
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
          title: "Unable to refresh facility calendar",
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

  function createPracticeBooking(draft: UnifiedCalendarQuickAddDraft) {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const optimisticAllocationId = buildOptimisticId("optimistic-allocation");
    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      entryType: "practice",
      title: draft.title,
      summary: "",
      visibility: "internal",
      status: "scheduled",
      hostTeamId: hostTeamId || null,
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
        createdVia: "facility_workspace",
        optimistic: true
      },
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    const optimisticAllocation: FacilityAllocation = {
      id: optimisticAllocationId,
      orgId: resolveOrgId(readModel),
      occurrenceId: optimisticOccurrenceId,
      spaceId,
      configurationId: configurationId || "optimistic-config",
      lockMode: "exclusive",
      allowShared: true,
      startsAtUtc: draft.startsAtUtc,
      endsAtUtc: draft.endsAtUtc,
      isActive: true,
      metadataJson: {},
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    setReadModel((current) => ({
      ...current,
      entries: [...current.entries, optimisticEntry],
      occurrences: [...current.occurrences, optimisticOccurrence],
      allocations: [...current.allocations, optimisticAllocation]
    }));
    setSelectedOccurrenceId(optimisticOccurrenceId);

    startSaving(async () => {
      if (!hostTeamId) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId, optimisticAllocationId);
        toast({
          title: "Host team required",
          description: "Select a host team before creating a facility practice booking.",
          variant: "destructive"
        });
        return;
      }

      const entryResult = await createCalendarEntryAction({
        orgSlug,
        entryType: "practice",
        title: draft.title,
        summary: "",
        visibility: "internal",
        status: "scheduled",
        hostTeamId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: spaceName
      });

      if (!entryResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId, optimisticAllocationId);
        toast({
          title: "Unable to create practice",
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
          createdVia: "facility_workspace"
        }
      });

      if (!occurrenceResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId, optimisticAllocationId);
        toast({
          title: "Unable to create facility occurrence",
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

      const allocationResult = await assignFacilityAllocationAction({
        orgSlug,
        occurrenceId: occurrenceResult.data.occurrenceId,
        spaceId,
        configurationId: configurationId || undefined,
        lockMode: "exclusive",
        allowShared: true
      });

      if (!allocationResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId, optimisticAllocationId);
        toast({
          title: "Unable to reserve facility",
          description: allocationResult.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      refreshWorkspace("Facility practice booked");
    });
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{spaceName} Calendar</CardTitle>
        <CardDescription>Book practices against facility configurations with strict conflict locking and optional shared invites.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            disabled={!canWrite}
            onChange={(event) => setHostTeamId(event.target.value)}
            options={activeTeams.length > 0 ? activeTeams.map((team) => ({ label: team.label, value: team.id })) : [{ label: "No teams", value: "" }]}
            value={hostTeamId}
          />
          <Select
            disabled={!canWrite}
            onChange={(event) => setConfigurationId(event.target.value)}
            options={
              spaceConfigurations.length > 0
                ? [{ label: "Auto default configuration", value: "" }, ...spaceConfigurations.map((config) => ({ label: config.name, value: config.id }))]
                : [{ label: "Auto default configuration", value: "" }]
            }
            value={configurationId}
          />
          <Select
            disabled={!canWrite}
            onChange={(event) => setInviteTeamId(event.target.value)}
            options={activeTeams.length > 0 ? activeTeams.map((team) => ({ label: team.label, value: team.id })) : [{ label: "No teams", value: "" }]}
            value={inviteTeamId}
          />
        </div>

        <UnifiedCalendar
          canEdit={canWrite}
          disableHoverGhost={Boolean(selectedOccurrenceId)}
          className="min-h-0 flex-1"
          getConflictMessage={(draft) => {
            const hasOverlap = filteredItems.some((item) => {
              const start = new Date(item.startsAtUtc).getTime();
              const end = new Date(item.endsAtUtc).getTime();
              const newStart = new Date(draft.startsAtUtc).getTime();
              const newEnd = new Date(draft.endsAtUtc).getTime();
              return newStart < end && newEnd > start;
            });
            return hasOverlap ? "This slot overlaps another reservation for this facility configuration." : null;
          }}
          items={filteredItems}
          onCreateRange={(range) =>
            createPracticeBooking({
              title: `${spaceName} practice`,
              startsAtUtc: range.startsAtUtc,
              endsAtUtc: range.endsAtUtc
            })
          }
          onQuickAdd={createPracticeBooking}
          onSelectItem={setSelectedOccurrenceId}
        />
        <Panel
          onClose={() => setSelectedOccurrenceId(null)}
          open={eventPanelOpen}
          subtitle={eventPanelSubtitle}
          title={selectedEntry?.title ?? "Event details"}
        >
          {selectedOccurrence && selectedEntry ? (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                Configuration: {spaceConfigurations.find((config) => config.id === selectedAllocation?.configurationId)?.name ?? "Auto"}
              </p>
              <Button
                disabled={!canWrite || !inviteTeamId}
                onClick={() => {
                  upsertInviteOptimistically({
                    occurrenceId: selectedOccurrence.id,
                    teamId: inviteTeamId,
                    role: "participant",
                    inviteStatus: "pending"
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

                    refreshWorkspace("Team invite sent");
                  });
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                Invite team to join
              </Button>
            </div>
          ) : null}
        </Panel>
      </CardContent>
    </Card>
  );
}
