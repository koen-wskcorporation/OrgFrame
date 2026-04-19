"use client";

import { useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { useToast } from "@orgframe/ui/primitives/toast";
import {
  archiveFacilitySpaceAction,
  createFacilitySpaceAction,
  toggleFacilitySpaceBookableAction,
  toggleFacilitySpaceOpenClosedAction,
  updateFacilitySpaceAction
} from "@/src/features/facilities/actions";
import { FacilityTreeEditor } from "@/src/features/facilities/components/FacilityTreeEditor";
import type { FacilityReservationReadModel } from "@/src/features/facilities/types";

type FacilitiesManagePanelProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: FacilityReservationReadModel;
};

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
      let result: { ok: true; data: T } | { ok: false; error: string };
      try {
        result = await mutation();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected server response.";
        toast({
          title: "Action failed",
          description: message,
          variant: "destructive"
        });
        return;
      }
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
        spaces={readModel.spaces.filter((space) => space.parentSpaceId === null)}
      />
    </div>
  );
}
