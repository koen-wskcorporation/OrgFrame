"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@/components/calendar/UnifiedCalendar";
import {
  assignFacilityAllocationAction,
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction
} from "@/modules/calendar/actions";
import type { CalendarReadModel } from "@/modules/calendar/types";
import { findEntryForOccurrence, findOccurrence, toCalendarItems, toLocalParts } from "@/modules/calendar/components/workspace-utils";

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
  const [isSaving, startSaving] = useTransition();

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
    startSaving(async () => {
      if (!hostTeamId) {
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
        toast({
          title: "Unable to create practice",
          description: entryResult.error,
          variant: "destructive"
        });
        return;
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startParts = toLocalParts(draft.startsAtUtc, timezone);
      const endParts = toLocalParts(draft.endsAtUtc, timezone);
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
        toast({
          title: "Unable to create facility occurrence",
          description: occurrenceResult.error,
          variant: "destructive"
        });
        return;
      }

      const allocationResult = await assignFacilityAllocationAction({
        orgSlug,
        occurrenceId: occurrenceResult.data.occurrenceId,
        spaceId,
        configurationId: configurationId || undefined,
        lockMode: "exclusive",
        allowShared: true
      });

      if (!allocationResult.ok) {
        toast({
          title: "Unable to reserve facility",
          description: allocationResult.error,
          variant: "destructive"
        });
        return;
      }

      refreshWorkspace("Facility practice booked");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{spaceName} Calendar</CardTitle>
        <CardDescription>Book practices against facility configurations with strict conflict locking and optional shared invites.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSaving ? <Alert variant="info">Saving booking changes...</Alert> : null}

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
          disableWeekCellHover={Boolean(selectedOccurrenceId)}
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
          sidePanelSlot={
            selectedOccurrence && selectedEntry ? (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedEntry.title}</CardTitle>
                  <CardDescription>
                    {selectedEntry.entryType} · {new Date(selectedOccurrence.startsAtUtc).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-text-muted">
                    Configuration: {spaceConfigurations.find((config) => config.id === selectedAllocation?.configurationId)?.name ?? "Auto"}
                  </p>
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

                        refreshWorkspace("Team invite sent");
                      });
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Invite team to join
                  </Button>
                </CardContent>
              </Card>
            ) : null
          }
        />
      </CardContent>
    </Card>
  );
}
