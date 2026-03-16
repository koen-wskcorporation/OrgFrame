"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Panel } from "@orgframe/ui/ui/panel";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  leaveSharedOccurrenceAction,
  respondToTeamInviteAction,
  setOccurrenceStatusAction
} from "@/modules/calendar/actions";
import type { CalendarEntry, CalendarOccurrence, CalendarReadModel, OccurrenceTeamInvite } from "@/modules/calendar/types";
import {
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@orgframe/ui/modules/calendar/components/workspace-utils";

type TeamCalendarWorkspaceProps = {
  orgSlug: string;
  teamId: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
};

export function TeamCalendarWorkspace({ orgSlug, teamId, canWrite, initialReadModel }: TeamCalendarWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const optimisticIdRef = useRef(0);
  const [, startSaving] = useTransition();

  const teamInvites = useMemo(
    () => readModel.invites.filter((invite) => invite.teamId === teamId && ["accepted", "pending", "left", "declined"].includes(invite.inviteStatus)),
    [readModel.invites, teamId]
  );

  const scopedReadModel = useMemo(() => {
    const occurrenceIds = new Set(teamInvites.map((invite) => invite.occurrenceId));
    return {
      ...readModel,
      occurrences: readModel.occurrences.filter((occurrence) => occurrenceIds.has(occurrence.id))
    };
  }, [readModel, teamInvites]);

  const items = useMemo(() => toCalendarItems(scopedReadModel), [scopedReadModel]);

  const selectedOccurrence = useMemo(() => (selectedOccurrenceId ? findOccurrence(readModel, selectedOccurrenceId) : null), [readModel, selectedOccurrenceId]);
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(readModel, selectedOccurrence) : null),
    [readModel, selectedOccurrence]
  );

  const selectedInvite = useMemo(
    () => (selectedOccurrence ? teamInvites.find((invite) => invite.occurrenceId === selectedOccurrence.id) ?? null : null),
    [selectedOccurrence, teamInvites]
  );

  function resolveOrgId(model: CalendarReadModel) {
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.invites[0]?.orgId ?? "";
  }

  const eventPanelOpen = Boolean(selectedOccurrence && selectedEntry);
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry ? `${selectedEntry.entryType} · ${selectedInvite?.inviteStatus ?? "not-invited"}` : "Select a calendar item to manage invites.";

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function removeOptimistic(optimisticEntryId: string, optimisticOccurrenceId: string) {
    setReadModel((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== optimisticEntryId),
      occurrences: current.occurrences.filter((occurrence) => occurrence.id !== optimisticOccurrenceId),
      invites: current.invites.filter((invite) => invite.occurrenceId !== optimisticOccurrenceId)
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
          title: "Unable to refresh team calendar",
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

  function quickAddTeamPractice(draft: UnifiedCalendarQuickAddDraft) {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      entryType: "practice",
      title: draft.title,
      summary: "",
      visibility: "internal",
      status: "scheduled",
      hostTeamId: teamId,
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
        createdVia: "team_workspace",
        optimistic: true
      },
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    setReadModel((current) => ({
      ...current,
      entries: [...current.entries, optimisticEntry],
      occurrences: [...current.occurrences, optimisticOccurrence]
    }));
    setSelectedOccurrenceId(optimisticOccurrenceId);

    startSaving(async () => {
      const entryResult = await createCalendarEntryAction({
        orgSlug,
        entryType: "practice",
        title: draft.title,
        summary: "",
        visibility: "internal",
        status: "scheduled",
        hostTeamId: teamId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: ""
      });

      if (!entryResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
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
          createdVia: "team_workspace"
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

      refreshWorkspace("Team practice created");
    });
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Team Calendar</CardTitle>
        <CardDescription>Manage team-hosted practices and invited shared sessions.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <UnifiedCalendar
          canEdit={canWrite}
          disableHoverGhost={Boolean(selectedOccurrenceId)}
          className="min-h-0 flex-1"
          items={items}
          onCreateRange={(range) =>
            quickAddTeamPractice({
              title: "Team practice",
              startsAtUtc: range.startsAtUtc,
              endsAtUtc: range.endsAtUtc
            })
          }
          onQuickAdd={quickAddTeamPractice}
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
                {new Date(selectedOccurrence.startsAtUtc).toLocaleString()} - {new Date(selectedOccurrence.endsAtUtc).toLocaleString()}
              </p>

              {selectedInvite?.role === "participant" && selectedInvite.inviteStatus === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      upsertInviteOptimistically({
                        occurrenceId: selectedOccurrence.id,
                        teamId,
                        role: "participant",
                        inviteStatus: "accepted"
                      });
                      startSaving(async () => {
                        const result = await respondToTeamInviteAction({
                          orgSlug,
                          occurrenceId: selectedOccurrence.id,
                          teamId,
                          response: "accepted"
                        });

                        if (!result.ok) {
                          toast({
                            title: "Unable to accept invite",
                            description: result.error,
                            variant: "destructive"
                          });
                          refreshWorkspace();
                          return;
                        }

                        refreshWorkspace("Invite accepted");
                      });
                    }}
                    size="sm"
                    type="button"
                  >
                    Accept
                  </Button>
                  <Button
                    onClick={() => {
                      upsertInviteOptimistically({
                        occurrenceId: selectedOccurrence.id,
                        teamId,
                        role: "participant",
                        inviteStatus: "declined"
                      });
                      startSaving(async () => {
                        const result = await respondToTeamInviteAction({
                          orgSlug,
                          occurrenceId: selectedOccurrence.id,
                          teamId,
                          response: "declined"
                        });

                        if (!result.ok) {
                          toast({
                            title: "Unable to decline invite",
                            description: result.error,
                            variant: "destructive"
                          });
                          refreshWorkspace();
                          return;
                        }

                        refreshWorkspace("Invite declined");
                      });
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Decline
                  </Button>
                </div>
              ) : null}

              {selectedInvite?.role === "participant" && selectedInvite.inviteStatus === "accepted" ? (
                <Button
                  onClick={() => {
                    upsertInviteOptimistically({
                      occurrenceId: selectedOccurrence.id,
                      teamId,
                      role: "participant",
                      inviteStatus: "left"
                    });
                    startSaving(async () => {
                      const result = await leaveSharedOccurrenceAction({
                        orgSlug,
                        occurrenceId: selectedOccurrence.id,
                        teamId
                      });

                      if (!result.ok) {
                        toast({
                          title: "Unable to leave occurrence",
                          description: result.error,
                          variant: "destructive"
                        });
                        refreshWorkspace();
                        return;
                      }

                      refreshWorkspace("Left shared occurrence");
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Leave session
                </Button>
              ) : null}

              {selectedInvite?.role === "host" ? (
                <Button
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
                          title: "Unable to cancel host occurrence",
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
                  Cancel host occurrence
                </Button>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </CardContent>
    </Card>
  );
}
