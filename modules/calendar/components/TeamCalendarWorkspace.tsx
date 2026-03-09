"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@/modules/calendar/components/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  leaveSharedOccurrenceAction,
  respondToTeamInviteAction,
  setOccurrenceStatusAction
} from "@/modules/calendar/actions";
import type { CalendarReadModel } from "@/modules/calendar/types";
import { findEntryForOccurrence, findOccurrence, toCalendarItems, toLocalParts } from "@/modules/calendar/components/workspace-utils";

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
  const [isSaving, startSaving] = useTransition();

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
          createdVia: "team_workspace"
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

      refreshWorkspace("Team practice created");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Calendar</CardTitle>
        <CardDescription>Manage team-hosted practices and invited shared sessions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSaving ? <Alert variant="info">Saving team calendar updates...</Alert> : null}

        <UnifiedCalendar
          canEdit={canWrite}
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
          sidePanelSlot={
            selectedOccurrence && selectedEntry ? (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedEntry.title}</CardTitle>
                  <CardDescription>
                    {selectedEntry.entryType} · {selectedInvite?.inviteStatus ?? "not-invited"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-text-muted">
                    {new Date(selectedOccurrence.startsAtUtc).toLocaleString()} - {new Date(selectedOccurrence.endsAtUtc).toLocaleString()}
                  </p>

                  {selectedInvite?.role === "participant" && selectedInvite.inviteStatus === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
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
                </CardContent>
              </Card>
            ) : null
          }
        />
      </CardContent>
    </Card>
  );
}
