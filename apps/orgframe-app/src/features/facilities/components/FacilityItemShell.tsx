"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { ItemPageHeader } from "@orgframe/ui/primitives/item-page-header";
import { StatusChipPicker } from "@orgframe/ui/primitives/status-chip-picker";
import { useToast } from "@orgframe/ui/primitives/toast";
import { updateFacilitySpaceAction } from "@/src/features/facilities/actions";
import { SpaceCreateWizard } from "@/src/features/facilities/components/SpaceCreateWizard";
import type { FacilityReservationReadModel, FacilitySpace, FacilitySpaceStatusDef } from "@/src/features/facilities/types";

type FacilityItemShellProps = {
  orgSlug: string;
  initialSpace: FacilitySpace;
  spaces: FacilitySpace[];
  spaceStatuses: FacilitySpaceStatusDef[];
  canWrite: boolean;
  children: React.ReactNode;
};

export function FacilityItemShell({
  orgSlug,
  initialSpace,
  spaces,
  spaceStatuses,
  canWrite,
  children
}: FacilityItemShellProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [space, setSpace] = React.useState(initialSpace);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [pendingStatusId, setPendingStatusId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSpace(initialSpace);
  }, [initialSpace]);

  const pickerOptions = React.useMemo(
    () => spaceStatuses.map((status) => ({ value: status.id, label: status.label, color: status.color })),
    [spaceStatuses]
  );

  async function handleStatusChange(nextStatusId: string) {
    if (!canWrite || nextStatusId === space.statusId) return;
    const previous = space.statusId;
    setSpace((current) => ({ ...current, statusId: nextStatusId }));
    setPendingStatusId(nextStatusId);

    const result = await updateFacilitySpaceAction({
      orgSlug,
      spaceId: space.id,
      parentSpaceId: space.parentSpaceId,
      name: space.name,
      slug: space.slug,
      spaceKind: space.spaceKind,
      statusId: nextStatusId,
      isBookable: space.isBookable,
      timezone: space.timezone,
      capacity: space.capacity,
      sortIndex: space.sortIndex
    });

    setPendingStatusId(null);
    if (!result.ok) {
      setSpace((current) => ({ ...current, statusId: previous }));
      toast({ title: "Couldn't change status", description: result.error, variant: "destructive" });
      return;
    }
    const updated = result.data.readModel.spaces.find((s) => s.id === space.id);
    if (updated) setSpace(updated);
  }

  function handleSavedFromWizard(readModel: FacilityReservationReadModel) {
    const updated = readModel.spaces.find((s) => s.id === space.id);
    if (updated) {
      // If slug changed we need to re-route to the new URL.
      if (updated.slug !== space.slug) {
        router.replace(`/${orgSlug}/manage/facilities/${updated.slug}`);
      } else {
        router.refresh();
      }
      setSpace(updated);
    }
  }

  return (
    <>
      <ItemPageHeader
        title={space.name}
        status={
          <StatusChipPicker
            disabled={!canWrite || pendingStatusId !== null}
            onChange={handleStatusChange}
            options={pickerOptions}
            value={space.statusId}
          />
        }
        description="Manage this facility's map and the spaces inside it."
        actions={
          <Button onClick={() => setSettingsOpen(true)} variant="secondary">
            <Settings2 className="h-4 w-4" />
            Settings
          </Button>
        }
      />

      {children}

      <SpaceCreateWizard
        canWrite={canWrite}
        mode="edit"
        onClose={() => setSettingsOpen(false)}
        onSaved={handleSavedFromWizard}
        open={settingsOpen}
        orgSlug={orgSlug}
        space={space}
        spaceStatuses={spaceStatuses}
        spaces={spaces}
      />
    </>
  );
}
