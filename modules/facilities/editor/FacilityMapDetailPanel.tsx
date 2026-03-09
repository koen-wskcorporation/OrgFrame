"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { FacilityBookingMap } from "@/modules/facilities/booking/FacilityBookingMap";
import { FacilityEditorShell } from "@/modules/facilities/editor/FacilityEditorShell";
import type { Facility, FacilityMapReadModel, FacilityNode } from "@/modules/facilities/types";

type FacilityMapDetailPanelProps = {
  orgSlug: string;
  facility: Facility;
  nodes: FacilityNode[];
  canWrite: boolean;
  initialReadModel?: FacilityMapReadModel;
  openEditorOnMount?: boolean;
};

export function FacilityMapDetailPanel({
  orgSlug,
  facility,
  nodes,
  canWrite,
  initialReadModel,
  openEditorOnMount = false
}: FacilityMapDetailPanelProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(openEditorOnMount && canWrite);
  const [readModel, setReadModel] = useState<FacilityMapReadModel | null>(initialReadModel ?? null);

  useEffect(() => {
    if (openEditorOnMount && canWrite) {
      setIsEditorOpen(true);
    }
  }, [canWrite, openEditorOnMount]);

  useEffect(() => {
    setReadModel(initialReadModel ?? null);
  }, [initialReadModel]);

  const sourceNodes = readModel?.nodes ?? nodes;
  const scopedNodes = useMemo(() => sourceNodes.filter((node) => node.facilityId === facility.id), [facility.id, sourceNodes]);
  const bookableCount = useMemo(() => scopedNodes.filter((node) => node.isBookable && node.status === "open").length, [scopedNodes]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{facility.name} Map</CardTitle>
              <CardDescription>
                {facility.facilityType} · {facility.status} · {scopedNodes.length} nodes · {bookableCount} bookable
              </CardDescription>
            </div>
            {canWrite && readModel ? (
              <Button onClick={() => setIsEditorOpen(true)} size="sm" type="button" variant="secondary">
                Edit map
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <FacilityBookingMap nodes={scopedNodes} selectedNodeIds={[]} unavailableNodeIds={[]} />
        </CardContent>
      </Card>

      {readModel ? (
        <Modal
          contentClassName="h-full min-h-0 overflow-hidden p-4 sm:p-5"
          description="Edit hierarchy, placement, and node settings in one fullscreen workspace."
          onClose={() => setIsEditorOpen(false)}
          open={isEditorOpen}
          size="full"
          title={`Edit Map · ${facility.name}`}
        >
          <FacilityEditorShell
            canWrite={canWrite}
            facility={facility}
            initialReadModel={readModel}
            onReadModelChange={setReadModel}
            orgSlug={orgSlug}
          />
        </Modal>
      ) : null}
    </>
  );
}
