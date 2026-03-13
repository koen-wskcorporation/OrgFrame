"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  archiveFacilitySpaceAction,
  createFacilitySpaceAction,
  deleteFacilitySpaceAction,
  toggleFacilitySpaceBookableAction,
  toggleFacilitySpaceOpenClosedAction,
  updateFacilitySpaceAction
} from "@/modules/facilities/actions";
import { FacilityStatusBadge } from "@/modules/facilities/components/FacilityStatusBadge";
import { FacilityStructurePanel } from "@/modules/facilities/components/FacilityStructurePanel";
import { buildFacilitySpaceStatusOptions, formatFacilitySpaceStatusLabel, resolveFacilitySpaceStatusLabels } from "@/modules/facilities/status";
import type { FacilityReservationReadModel, FacilitySpace } from "@/modules/facilities/types";

export type FacilityManageDetailSection = "overview" | "structure" | "settings";

type FacilityManageDetailPanelProps = {
  orgSlug: string;
  canWrite: boolean;
  selectedSpace: FacilitySpace;
  initialReadModel: FacilityReservationReadModel;
  activeSection: FacilityManageDetailSection;
};

export function FacilityManageDetailPanel({
  orgSlug,
  canWrite,
  selectedSpace,
  initialReadModel,
  activeSection
}: FacilityManageDetailPanelProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [isMutating, startTransition] = useTransition();

  const currentSelectedSpace = useMemo(
    () => readModel.spaces.find((space) => space.id === selectedSpace.id) ?? selectedSpace,
    [readModel.spaces, selectedSpace]
  );

  const selectedSpaceStatusLabels = useMemo(() => resolveFacilitySpaceStatusLabels(currentSelectedSpace), [currentSelectedSpace]);
  const selectedSpaceStatusOptions = useMemo(() => buildFacilitySpaceStatusOptions(selectedSpaceStatusLabels), [selectedSpaceStatusLabels]);

  function applyReadModel(next: FacilityReservationReadModel) {
    setReadModel(next);
  }

  function withToast<T extends { readModel: FacilityReservationReadModel }>(
    mutation: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    successTitle?: string
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
      if (successTitle) {
        toast({
          title: successTitle,
          variant: "success"
        });
      }
    });
  }

  return (
    <div className="ui-stack-page">
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
            <p className="text-sm text-text-muted">Use the tabs to manage structure and settings for this facility.</p>
          </CardContent>
        </Card>
      ) : null}

      {activeSection === "settings" ? (
        <Card>
          <CardHeader>
            <CardTitle>Facility settings</CardTitle>
            <CardDescription>Update status, booking controls, and archive state.</CardDescription>
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

      {activeSection === "structure" ? (
        <FacilityStructurePanel
          canWrite={canWrite}
          isMutating={isMutating}
          onArchiveSpace={(spaceId) =>
            withToast(
              () =>
                archiveFacilitySpaceAction({
                  orgSlug,
                  spaceId
                })
            )
          }
          onCreateSpace={(input) =>
            withToast(
              () =>
                createFacilitySpaceAction({
                  orgSlug,
                  ...input
                })
            )
          }
          onDeleteSpace={(spaceId) =>
            withToast(
              () =>
                deleteFacilitySpaceAction({
                  orgSlug,
                  spaceId
                })
            )
          }
          onUpdateSpace={(input) =>
            withToast(
              () =>
                updateFacilitySpaceAction({
                  orgSlug,
                  ...input
                })
            )
          }
          orgSlug={orgSlug}
          selectedSpace={currentSelectedSpace}
          spaces={readModel.spaces}
        />
      ) : null}
    </div>
  );
}
