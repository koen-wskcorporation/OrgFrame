"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Input } from "@orgframe/ui/ui/input";
import { useToast } from "@orgframe/ui/ui/toast";
import {
  archiveFacilitySpaceAction,
  createFacilitySpaceAction,
  deleteFacilitySpaceAction,
  toggleFacilitySpaceBookableAction,
  toggleFacilitySpaceOpenClosedAction,
  updateFacilitySpaceAction
} from "@/modules/facilities/actions";
import { FacilityStatusBadge } from "@orgframe/ui/modules/facilities/components/FacilityStatusBadge";
import { FacilityStructurePanel } from "@orgframe/ui/modules/facilities/components/FacilityStructurePanel";
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

function readFacilityAddressFromMetadata(space: FacilitySpace) {
  const metadata = space.metadataJson ?? {};
  const address = metadata.address;
  return typeof address === "string" ? address.trim() : "";
}

function buildMetadataWithAddress(space: FacilitySpace, addressDraft: string) {
  const nextAddress = addressDraft.trim();
  const metadata = { ...space.metadataJson };
  if (nextAddress.length > 0) {
    return {
      ...metadata,
      address: nextAddress
    };
  }
  delete metadata.address;
  return metadata;
}

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
  const [facilityAddressDraft, setFacilityAddressDraft] = useState(() => readFacilityAddressFromMetadata(currentSelectedSpace));
  const isTopLevelFacility = currentSelectedSpace.parentSpaceId === null;
  const currentFacilityAddress = useMemo(() => readFacilityAddressFromMetadata(currentSelectedSpace), [currentSelectedSpace]);
  const hasAddressChanges = facilityAddressDraft.trim() !== currentFacilityAddress;

  useEffect(() => {
    setFacilityAddressDraft(readFacilityAddressFromMetadata(currentSelectedSpace));
  }, [currentSelectedSpace]);

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
            <CardDescription>Update status, booking controls, archive state, and top-level address details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isTopLevelFacility ? (
              <div className="space-y-2 rounded-control border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Facility address</p>
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setFacilityAddressDraft(event.target.value)}
                  placeholder="Enter facility address"
                  value={facilityAddressDraft}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={!canWrite || !hasAddressChanges || isMutating}
                    onClick={() =>
                      withToast(
                        () =>
                          updateFacilitySpaceAction({
                            orgSlug,
                            spaceId: currentSelectedSpace.id,
                            name: currentSelectedSpace.name,
                            metadataJson: buildMetadataWithAddress(currentSelectedSpace, facilityAddressDraft)
                          }),
                        "Facility address updated"
                      )
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Save address
                  </Button>
                  {currentFacilityAddress ? (
                    <Button
                      disabled={!canWrite || isMutating}
                      onClick={() =>
                        withToast(
                          () =>
                            updateFacilitySpaceAction({
                              orgSlug,
                              spaceId: currentSelectedSpace.id,
                              name: currentSelectedSpace.name,
                              metadataJson: buildMetadataWithAddress(currentSelectedSpace, "")
                            }),
                          "Facility address cleared"
                        )
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Clear address
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
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
