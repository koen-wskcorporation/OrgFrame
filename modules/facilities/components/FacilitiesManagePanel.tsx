"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  approveFacilityReservationAction,
  archiveFacilitySpaceAction,
  cancelBlackoutAction,
  cancelFacilityReservationAction,
  createBlackoutAction,
  createFacilityReservationAction,
  createFacilitySpaceAction,
  deleteFacilityReservationRuleAction,
  rejectFacilityReservationAction,
  restoreFacilityReservationAction,
  toggleFacilitySpaceBookableAction,
  toggleFacilitySpaceOpenClosedAction,
  updateBlackoutAction,
  updateFacilityReservationAction,
  updateFacilitySpaceAction,
  upsertFacilityReservationRuleAction
} from "@/modules/facilities/actions";
import { FacilitySchedulePanel, toRulePayloadFromDraft, type RuleDraft } from "@/modules/facilities/components/FacilitySchedulePanel";
import { FacilityTreeEditor } from "@/modules/facilities/components/FacilityTreeEditor";
import type { FacilityReservationException, FacilityReservationReadModel } from "@/modules/facilities/types";
import type { ReservationEditorSubmitInput } from "@/modules/facilities/components/ReservationEditorPanel";

type FacilitiesManagePanelProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: FacilityReservationReadModel;
};

function normalizeReservationInput(input: ReservationEditorSubmitInput) {
  return {
    spaceId: input.spaceId,
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

export function FacilitiesManagePanel({ orgSlug, canWrite, initialReadModel }: FacilitiesManagePanelProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [isMutating, startTransition] = useTransition();

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
          ...payload
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

      <FacilityTreeEditor
        canWrite={canWrite}
        orgSlug={orgSlug}
        onArchiveSpace={(spaceId) =>
          withToast(
            () =>
              archiveFacilitySpaceAction({
                orgSlug,
                spaceId
              }),
            "Space archived"
          )
        }
        onCreateSpace={(input) =>
          withToast(
            () =>
              createFacilitySpaceAction({
                orgSlug,
                ...input
              }),
            "Space created"
          )
        }
        onToggleBookable={(spaceId, isBookable) =>
          withToast(
            () =>
              toggleFacilitySpaceBookableAction({
                orgSlug,
                spaceId,
                isBookable
              }),
            "Bookable state updated"
          )
        }
        onSetStatus={(spaceId, status) =>
          withToast(
            () =>
              toggleFacilitySpaceOpenClosedAction({
                orgSlug,
                spaceId,
                status
              }),
            "Space status updated"
          )
        }
        onUpdateSpace={(input) =>
          withToast(
            () =>
              updateFacilitySpaceAction({
                orgSlug,
                ...input
              }),
            "Space updated"
          )
        }
        spaces={readModel.spaces}
      />

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
                ...normalizeReservationInput(input),
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
                ...normalizeReservationInput(input)
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
                ...normalizeReservationInput(input),
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
                ...normalizeReservationInput(input),
                status: input.status
              });
            },
            "Reservation updated"
          )
        }
        reservations={readModel.reservations}
        rules={readModel.rules}
        spaces={readModel.spaces}
      />

      <Card>
        <CardHeader>
          <CardTitle>Rule Exceptions</CardTitle>
          <CardDescription>{handleExceptionSummary(readModel.exceptions)}</CardDescription>
        </CardHeader>
        <CardContent className="ui-list-stack">
          {readModel.exceptions.length === 0 ? <p className="text-sm text-text-muted">No skip/override exceptions configured.</p> : null}
          <div className="ui-list-stack">
            {readModel.exceptions.map((exception) => (
              <div className="ui-list-item py-2 text-sm text-text" key={exception.id}>
                {exception.kind} - {exception.sourceKey}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
