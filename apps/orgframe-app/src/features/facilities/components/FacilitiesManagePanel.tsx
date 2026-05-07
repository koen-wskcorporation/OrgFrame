"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { ChipPicker, RepeaterChip } from "@orgframe/ui/primitives/chip";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { useToast } from "@orgframe/ui/primitives/toast";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { FacilityMapWorkspace } from "@/src/features/facilities/map/components/FacilityMapWorkspace";
import { SpaceCreateWizard } from "@/src/features/facilities/components/SpaceCreateWizard";
import { updateFacilityAction } from "@/src/features/facilities/actions";
import type { Facility, FacilityReservationReadModel } from "@/src/features/facilities/types";

type FacilitiesManagePanelProps = {
  orgSlug: string;
  orgId: string;
  canWrite: boolean;
  initialReadModel: FacilityReservationReadModel;
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active", color: "emerald" },
  { value: "archived", label: "Archived", color: "slate" }
];

export function FacilitiesManagePanel({ orgSlug, orgId, canWrite, initialReadModel }: FacilitiesManagePanelProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [mapFacility, setMapFacility] = useState<Facility | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const facilities = [...readModel.facilities].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return a.sortIndex - b.sortIndex || a.name.localeCompare(b.name);
  });

  function handleStatusChange(facility: Facility, nextStatus: string) {
    if (!canWrite || nextStatus === facility.status) return;
    setPendingStatusId(facility.id);
    startTransition(async () => {
      const result = await updateFacilityAction({
        orgSlug,
        facilityId: facility.id,
        name: facility.name,
        slug: facility.slug,
        status: nextStatus as "active" | "archived"
      });
      setPendingStatusId(null);
      if (!result.ok) {
        toast({ title: "Couldn't update status", description: result.error, variant: "destructive" });
        return;
      }
      setReadModel(result.data.readModel);
      toast({ title: nextStatus === "archived" ? "Facility archived" : "Facility restored", variant: "success" });
    });
  }

  return (
    <>
      <PageShell title="Facilities">
        {!canWrite ? <Alert variant="info">You have read-only access to facilities.</Alert> : null}
        <ManageSection
          actions={
            <Button disabled={!canWrite} onClick={() => setIsCreateOpen(true)} type="button">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          }
          description="Manage facility spaces and structure."
          fill={false}
          title="Facilities"
        >
          <Repeater
            emptyMessage='No facilities yet. Click "New facility" to create your first one.'
            getSearchValue={(facility) => `${facility.name} ${facility.slug}`}
            initialView="list"
            items={facilities}
            searchPlaceholder="Search facilities"
            viewKey="manage.facilities"
            getItem={(facility) => {
              const childCount = readModel.spaces.filter((s) => s.facilityId === facility.id).length;
              return {
                id: facility.id,
                title: facility.name,
                meta: <>/{facility.slug}</>,
                chips: (
                  <>
                    <ChipPicker
                      disabled={!canWrite || pendingStatusId === facility.id}
                      onChange={(next) => handleStatusChange(facility, next)}
                      options={STATUS_OPTIONS}
                      value={facility.status}
                    />
                    <RepeaterChip label={`${childCount} ${childCount === 1 ? "space" : "spaces"}`} />
                    <RepeaterChip label={facility.environment === "indoor" ? "Indoor" : "Outdoor"} />
                  </>
                ),
                secondaryActions: (
                  <Button
                    disabled={!canWrite}
                    onClick={() => setEditingFacility(facility)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Manage
                  </Button>
                ),
                primaryAction: (
                  <Button onClick={() => setMapFacility(facility)} size="sm" type="button" variant="primary">
                    Edit map
                  </Button>
                )
              };
            }}
          />
        </ManageSection>
      </PageShell>

      {/* Create wizard */}
      <SpaceCreateWizard
        onClose={() => setIsCreateOpen(false)}
        onCreated={(next) => {
          setReadModel(next);
          setIsCreateOpen(false);
          toast({ title: "Facility created", variant: "success" });
        }}
        open={isCreateOpen}
        orgSlug={orgSlug}
        spaceStatuses={readModel.spaceStatuses}
      />

      {/* Edit (manage) wizard */}
      {editingFacility ? (
        <SpaceCreateWizard
          canWrite={canWrite}
          facility={editingFacility}
          mode="edit"
          onClose={() => setEditingFacility(null)}
          onSaved={(next) => {
            setReadModel(next);
            setEditingFacility(null);
            toast({ title: "Facility updated", variant: "success" });
          }}
          open={true}
          orgSlug={orgSlug}
          spaceStatuses={readModel.spaceStatuses}
        />
      ) : null}

      {/* Full-screen map editor — opened directly in edit mode, no preview card */}
      {mapFacility ? (
        <FacilityMapWorkspace
          key={mapFacility.id}
          canWrite={canWrite}
          defaultEditorOpen
          facility={mapFacility}
          hidePreview
          onEditorClose={() => setMapFacility(null)}
          orgId={orgId}
          orgSlug={orgSlug}
          spaces={readModel.spaces.filter((s) => s.facilityId === mapFacility.id)}
          spaceStatuses={readModel.spaceStatuses}
        />
      ) : null}
    </>
  );
}
