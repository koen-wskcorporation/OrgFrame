"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  approveFacilityReservationAction,
  archiveFacilitySpaceAction,
  cancelBlackoutAction,
  cancelFacilityReservationAction,
  createBlackoutAction,
  createFacilityReservationAction,
  deleteFacilityReservationRuleAction,
  rejectFacilityReservationAction,
  restoreFacilityReservationAction,
  toggleFacilitySpaceBookableAction,
  toggleFacilitySpaceOpenClosedAction,
  updateBlackoutAction,
  updateFacilityReservationAction,
  upsertFacilityReservationRuleAction
} from "@/modules/facilities/actions";
import { FacilityStatusBadge } from "@/modules/facilities/components/FacilityStatusBadge";
import { FacilitySchedulePanel, toRulePayloadFromDraft, type RuleDraft } from "@/modules/facilities/components/FacilitySchedulePanel";
import { buildFacilitySpaceStatusOptions, formatFacilitySpaceStatusLabel, resolveFacilitySpaceStatusLabels } from "@/modules/facilities/status";
import type { FacilityReservationException, FacilityReservationReadModel, FacilitySpace } from "@/modules/facilities/types";
import type { ReservationEditorSubmitInput } from "@/modules/facilities/components/ReservationEditorPanel";

export type FacilityManageDetailSection = "overview" | "schedule" | "exceptions" | "settings";

type FacilityManageDetailPanelProps = {
  orgSlug: string;
  canWrite: boolean;
  selectedSpace: FacilitySpace;
  initialReadModel: FacilityReservationReadModel;
  activeSection: FacilityManageDetailSection;
};

function normalizeReservationInput(input: ReservationEditorSubmitInput, selectedSpaceId: string) {
  return {
    spaceId: input.spaceId || selectedSpaceId,
    reservationKind: input.reservationKind,
    status: input.status,
    localDate: input.localDate,
    localStartTime: input.localStartTime,
    localEndTime: input.localEndTime,
    timezone: input.timezone,
    publicLabel: input.publicLabel,
    internalNotes: input.internalNotes,
    eventId: input.eventId || null,
    programId: input.programId || null,
    conflictOverride: input.conflictOverride
  };
}

export function FacilityManageDetailPanel({ orgSlug, canWrite, selectedSpace, initialReadModel, activeSection }: FacilityManageDetailPanelProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [isMutating, startTransition] = useTransition();
  const currentSelectedSpace = useMemo(
    () => readModel.spaces.find((space) => space.id === selectedSpace.id) ?? selectedSpace,
    [readModel.spaces, selectedSpace]
  );
  const selectedSpaceStatusLabels = useMemo(() => resolveFacilitySpaceStatusLabels(currentSelectedSpace), [currentSelectedSpace]);
  const selectedSpaceStatusOptions = useMemo(
    () => buildFacilitySpaceStatusOptions(selectedSpaceStatusLabels),
    [selectedSpaceStatusLabels]
  );

  const scopedReservations = useMemo(
    () => readModel.reservations.filter((reservation) => reservation.spaceId === currentSelectedSpace.id),
    [currentSelectedSpace.id, readModel.reservations]
  );
  const scopedRules = useMemo(
    () => readModel.rules.filter((rule) => rule.spaceId === currentSelectedSpace.id),
    [currentSelectedSpace.id, readModel.rules]
  );
  const scopedRuleIds = useMemo(() => new Set(scopedRules.map((rule) => rule.id)), [scopedRules]);
  const scopedExceptions = useMemo(
    () => readModel.exceptions.filter((exception) => scopedRuleIds.has(exception.ruleId)),
    [readModel.exceptions, scopedRuleIds]
  );

  function applyReadModel(next: FacilityReservationReadModel) {
    setReadModel(next);
  }

  function withToast<T extends { readModel: FacilityReservationReadModel }>(
    mutation: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    successTitle: string
  ) {
    startTransition(async () => {
      const result = await mutation();
      if (!result.ok) {
        toast({
          title: "Action failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      toast({
        title: successTitle,
        variant: "success"
      });
    });
  }

  function handleRuleSave(draft: RuleDraft) {
    const payload = toRulePayloadFromDraft(draft);

    withToast(
      () =>
        upsertFacilityReservationRuleAction({
          orgSlug,
          ...payload,
          spaceId: payload.spaceId || currentSelectedSpace.id
        }),
      "Rule saved"
    );
  }

  function handleExceptionSummary(exceptions: FacilityReservationException[]) {
    if (exceptions.length === 0) {
      return "No exceptions";
    }

    const skipCount = exceptions.filter((item) => item.kind === "skip").length;
    const overrideCount = exceptions.filter((item) => item.kind === "override").length;
    return `${exceptions.length} exception${exceptions.length === 1 ? "" : "s"} (${skipCount} skip, ${overrideCount} override)`;
  }

  return (
    <div className="ui-stack-page">
      {isMutating ? <Alert variant="info">Saving facilities changes...</Alert> : null}

      {activeSection === "overview" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{currentSelectedSpace.name}</CardTitle>
                <CardDescription>
                  {currentSelectedSpace.spaceKind} · {currentSelectedSpace.timezone}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FacilityStatusBadge
                  disabled={!canWrite}
                  label={formatFacilitySpaceStatusLabel(currentSelectedSpace.status, selectedSpaceStatusLabels)}
                  onSelectSpaceStatus={(nextStatus) =>
                    withToast(
                      () =>
                        toggleFacilitySpaceOpenClosedAction({
                          orgSlug,
                          spaceId: currentSelectedSpace.id,
                          status: nextStatus
                        }),
                      "Space status updated"
                    )
                  }
                  spaceStatusOptions={selectedSpaceStatusOptions}
                  status={currentSelectedSpace.status}
                />
                <span className="text-xs text-text-muted">{currentSelectedSpace.isBookable ? "Bookable" : "Not bookable"}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted">
              Use the tabs to manage bookings, review exceptions, and update settings for this facility.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {activeSection === "settings" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>Facility settings</CardTitle>
                <CardDescription>Update status, booking controls, and archive state.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button href={`/${orgSlug}/tools/facilities`} size="sm" variant="secondary">
                Back to facilities
              </Button>
              <Button
                disabled={!canWrite || currentSelectedSpace.status === "archived"}
                onClick={() =>
                  withToast(
                    () =>
                      toggleFacilitySpaceOpenClosedAction({
                        orgSlug,
                        spaceId: currentSelectedSpace.id,
                        status: currentSelectedSpace.status === "open" ? "closed" : "open"
                      }),
                    "Space status updated"
                  )
                }
                size="sm"
                type="button"
                variant="secondary"
              >
                {currentSelectedSpace.status === "open" ? "Close space" : "Open space"}
              </Button>
              <Button
                disabled={!canWrite}
                onClick={() =>
                  withToast(
                    () =>
                      toggleFacilitySpaceBookableAction({
                        orgSlug,
                        spaceId: currentSelectedSpace.id,
                        isBookable: !currentSelectedSpace.isBookable
                      }),
                    "Bookable state updated"
                  )
                }
                size="sm"
                type="button"
                variant="secondary"
              >
                {currentSelectedSpace.isBookable ? "Set non-bookable" : "Set bookable"}
              </Button>
              <Button
                disabled={!canWrite || currentSelectedSpace.status === "archived"}
                onClick={() =>
                  withToast(
                    () =>
                      archiveFacilitySpaceAction({
                        orgSlug,
                        spaceId: currentSelectedSpace.id
                      }),
                    "Space archived"
                  )
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Archive
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeSection === "schedule" ? (
        <FacilitySchedulePanel
          canWrite={canWrite}
          onApproveReservation={(reservationId) =>
            withToast(
              () =>
                approveFacilityReservationAction({
                  orgSlug,
                  reservationId
                }),
              "Reservation approved"
            )
          }
          onCancelBlackout={(reservationId) =>
            withToast(
              () =>
                cancelBlackoutAction({
                  orgSlug,
                  reservationId
                }),
              "Blackout cancelled"
            )
          }
          onCancelReservation={(reservationId) =>
            withToast(
              () =>
                cancelFacilityReservationAction({
                  orgSlug,
                  reservationId
                }),
              "Reservation cancelled"
            )
          }
          onCreateBlackout={(input: ReservationEditorSubmitInput) =>
            withToast(
              () =>
                createBlackoutAction({
                  orgSlug,
                  ...normalizeReservationInput(input, currentSelectedSpace.id),
                  reservationKind: "blackout"
                }),
              "Blackout created"
            )
          }
          onCreateReservation={(input: ReservationEditorSubmitInput) =>
            withToast(
              () =>
                createFacilityReservationAction({
                  orgSlug,
                  ...normalizeReservationInput(input, currentSelectedSpace.id)
                }),
              "Reservation created"
            )
          }
          onDeleteRule={(ruleId) =>
            withToast(
              () =>
                deleteFacilityReservationRuleAction({
                  orgSlug,
                  ruleId
                }),
              "Rule deleted"
            )
          }
          onRejectReservation={(reservationId) =>
            withToast(
              () =>
                rejectFacilityReservationAction({
                  orgSlug,
                  reservationId
                }),
              "Reservation rejected"
            )
          }
          onRestoreReservation={(reservationId) =>
            withToast(
              () =>
                restoreFacilityReservationAction({
                  orgSlug,
                  reservationId
                }),
              "Reservation restored"
            )
          }
          onSaveRule={handleRuleSave}
          onUpdateBlackout={(input: ReservationEditorSubmitInput) =>
            withToast(
              () => {
                if (!input.reservationId) {
                  return Promise.resolve({
                    ok: false as const,
                    error: "Reservation ID is missing."
                  });
                }

                return updateBlackoutAction({
                  orgSlug,
                  reservationId: input.reservationId,
                  ...normalizeReservationInput(input, currentSelectedSpace.id),
                  reservationKind: "blackout",
                  status: input.status
                });
              },
              "Blackout updated"
            )
          }
          onUpdateReservation={(input: ReservationEditorSubmitInput) =>
            withToast(
              () => {
                if (!input.reservationId) {
                  return Promise.resolve({
                    ok: false as const,
                    error: "Reservation ID is missing."
                  });
                }

                return updateFacilityReservationAction({
                  orgSlug,
                  reservationId: input.reservationId,
                  ...normalizeReservationInput(input, currentSelectedSpace.id),
                  status: input.status
                });
              },
              "Reservation updated"
            )
          }
          reservations={scopedReservations}
          rules={scopedRules}
          spaces={[currentSelectedSpace]}
        />
      ) : null}

      {activeSection === "exceptions" ? (
        <Card>
          <CardHeader>
            <CardTitle>Rule Exceptions</CardTitle>
            <CardDescription>{handleExceptionSummary(scopedExceptions)}</CardDescription>
          </CardHeader>
          <CardContent className="ui-list-stack">
            {scopedExceptions.length === 0 ? <p className="text-sm text-text-muted">No skip/override exceptions configured.</p> : null}
            <div className="ui-list-stack">
              {scopedExceptions.map((exception) => (
                <div className="ui-list-item py-2 text-sm text-text" key={exception.id}>
                  {exception.kind} - {exception.sourceKey}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
