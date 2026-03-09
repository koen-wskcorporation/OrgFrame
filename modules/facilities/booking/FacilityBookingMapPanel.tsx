"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { Facility, FacilityNode } from "@/modules/facilities/types";
import { FacilityBookingMap } from "@/modules/facilities/booking/FacilityBookingMap";

type FacilityBookingMapPanelProps = {
  open: boolean;
  canWrite: boolean;
  facilities: Facility[];
  nodes: FacilityNode[];
  selectedNodeIds: string[];
  unavailableNodeIds: string[];
  onClose: () => void;
  onConfirm: (input: { facilityId: string; nodeIds: string[] }) => void;
};

export function FacilityBookingMapPanel({
  open,
  canWrite,
  facilities,
  nodes,
  selectedNodeIds,
  unavailableNodeIds,
  onClose,
  onConfirm
}: FacilityBookingMapPanelProps) {
  const [facilityId, setFacilityId] = useState("");
  const [draftSelectedNodeIds, setDraftSelectedNodeIds] = useState<string[]>(selectedNodeIds);

  useEffect(() => {
    if (!open) {
      return;
    }

    const selectedFacilityFromAllocations = selectedNodeIds
      .map((nodeId) => nodes.find((node) => node.id === nodeId)?.facilityId)
      .find((value): value is string => Boolean(value));

    setFacilityId(selectedFacilityFromAllocations ?? facilities[0]?.id ?? "");
    setDraftSelectedNodeIds(selectedNodeIds);
  }, [facilities, nodes, open, selectedNodeIds]);

  const facilityNodes = useMemo(() => nodes.filter((node) => node.facilityId === facilityId), [facilityId, nodes]);
  const scopedSelected = useMemo(
    () => draftSelectedNodeIds.filter((nodeId) => facilityNodes.some((node) => node.id === nodeId)),
    [draftSelectedNodeIds, facilityNodes]
  );

  const scopedUnavailable = useMemo(
    () => unavailableNodeIds.filter((nodeId) => facilityNodes.some((node) => node.id === nodeId)),
    [facilityNodes, unavailableNodeIds]
  );

  function toggleNode(nodeId: string) {
    setDraftSelectedNodeIds((current) => {
      if (current.includes(nodeId)) {
        return current.filter((value) => value !== nodeId);
      }
      return [...current, nodeId];
    });
  }

  return (
    <Panel
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!canWrite || !facilityId}
            onClick={() => {
              onConfirm({
                facilityId,
                nodeIds: scopedSelected
              });
            }}
            type="button"
          >
            Confirm spaces
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      subtitle="Read-only map selection for this occurrence time window."
      title="Reserve Facility Spaces"
    >
      <div className="space-y-4">
        <FormField label="Facility">
          <Select
            disabled={!canWrite}
            onChange={(event) => setFacilityId(event.target.value)}
            options={facilities.map((facility) => ({
              value: facility.id,
              label: `${facility.name} (${facility.facilityType})`
            }))}
            value={facilityId}
          />
        </FormField>

        {facilityId ? (
          <FacilityBookingMap
            nodes={facilityNodes}
            onToggleNode={canWrite ? toggleNode : undefined}
            selectedNodeIds={scopedSelected}
            unavailableNodeIds={scopedUnavailable}
          />
        ) : null}
      </div>
    </Panel>
  );
}
