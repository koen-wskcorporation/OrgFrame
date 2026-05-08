"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { useToast } from "@orgframe/ui/primitives/toast";
import { SpaceCreateWizard } from "@/src/features/facilities/components/SpaceCreateWizard";
import type { Facility, FacilityReservationReadModel, FacilitySpaceStatusDef } from "@/src/features/facilities/types";

type FacilityItemShellProps = {
  orgSlug: string;
  initialFacility: Facility;
  spaceStatuses: FacilitySpaceStatusDef[];
  canWrite: boolean;
  children: React.ReactNode;
};

export function FacilityItemShell({
  orgSlug,
  initialFacility,
  spaceStatuses,
  canWrite,
  children
}: FacilityItemShellProps) {
  const { toast: _toast } = useToast();
  const router = useRouter();
  const [facility, setFacility] = React.useState(initialFacility);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  React.useEffect(() => {
    setFacility(initialFacility);
  }, [initialFacility]);

  function handleSavedFromWizard(readModel: FacilityReservationReadModel) {
    const updated = readModel.facilities.find((f) => f.id === facility.id);
    if (updated) {
      // If slug changed we need to re-route to the new URL (the route now
      // keys off the facility id, but the URL convention may use the slug
      // in the future — refresh keeps everything in sync regardless).
      if (updated.slug !== facility.slug) {
        router.replace(`/${orgSlug}/manage/facilities/${updated.id}`);
      } else {
        router.refresh();
      }
      setFacility(updated);
    }
  }

  return (
    <>
      <PageHeader
        title={facility.name}
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
        facility={facility}
        mode="edit"
        onClose={() => setSettingsOpen(false)}
        onSaved={handleSavedFromWizard}
        open={settingsOpen}
        orgSlug={orgSlug}
        spaceStatuses={spaceStatuses}
      />
    </>
  );
}
