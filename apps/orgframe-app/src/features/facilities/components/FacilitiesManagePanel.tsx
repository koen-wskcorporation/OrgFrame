"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { useToast } from "@orgframe/ui/primitives/toast";
import { SpaceCreateWizard } from "@/src/features/facilities/components/SpaceCreateWizard";
import type { FacilityReservationReadModel } from "@/src/features/facilities/types";

type FacilitiesManagePanelProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: FacilityReservationReadModel;
};

export function FacilitiesManagePanel({ orgSlug, canWrite, initialReadModel }: FacilitiesManagePanelProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Active first, archived demoted to the bottom (still visible so admins
  // can un-archive). Same query under the hood (`listFacilitiesForManage`)
  // returns both — sort here is purely presentational.
  const facilities = [...readModel.facilities].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return a.sortIndex - b.sortIndex || a.name.localeCompare(b.name);
  });

  return (
    <div className="ui-stack-page">
      <div className="flex items-center justify-end">
        <Button disabled={!canWrite} onClick={() => setIsWizardOpen(true)} variant="primary">
          <Plus />
          New facility
        </Button>
      </div>

      <SpaceCreateWizard
        onClose={() => setIsWizardOpen(false)}
        onCreated={(next) => {
          setReadModel(next);
          setIsWizardOpen(false);
          toast({ title: "Facility created", variant: "success" });
        }}
        open={isWizardOpen}
        orgSlug={orgSlug}
        spaceStatuses={readModel.spaceStatuses}
      />

      {facilities.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-text">No facilities yet.</p>
          <p className="mt-1 text-xs text-text-muted">Click "New facility" to create your first one.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {facilities.map((facility) => {
            const childCount = readModel.spaces.filter((s) => s.facilityId === facility.id).length;
            return (
              <li key={facility.id}>
                <Link
                  className="block rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
                  href={`/${orgSlug}/manage/facilities/${facility.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-text">{facility.name}</p>
                    {facility.status === "archived" ? (
                      <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Archived
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-text-muted">/{facility.slug}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    {childCount} {childCount === 1 ? "space" : "spaces"} ·{" "}
                    {facility.environment === "indoor" ? "Indoor" : "Outdoor"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
