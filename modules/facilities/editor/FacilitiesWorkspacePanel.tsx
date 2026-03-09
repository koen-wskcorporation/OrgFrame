"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { deleteFacilityAction, upsertFacilityAction } from "@/modules/facilities/actions";
import type { FacilityMapReadModel, FacilityType } from "@/modules/facilities/types";

type FacilitiesWorkspacePanelProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: FacilityMapReadModel;
};

type Draft = {
  facilityId?: string;
  name: string;
  facilityType: FacilityType;
  status: "open" | "closed" | "archived";
  timezone: string;
};

function toDraft(input?: {
  id?: string;
  name?: string;
  facilityType?: FacilityType;
  status?: "open" | "closed" | "archived";
  timezone?: string;
}): Draft {
  return {
    facilityId: input?.id,
    name: input?.name ?? "",
    facilityType: input?.facilityType ?? "complex",
    status: input?.status ?? "open",
    timezone: input?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

export function FacilitiesWorkspacePanel({ orgSlug, canWrite, initialReadModel }: FacilitiesWorkspacePanelProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [draft, setDraft] = useState<Draft>(() => toDraft());
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const facilities = useMemo(() => [...readModel.facilities].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name)), [readModel]);

  function handleSave() {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const result = await upsertFacilityAction({
        orgSlug,
        facilityId: draft.facilityId,
        name: draft.name,
        facilityType: draft.facilityType,
        status: draft.status,
        timezone: draft.timezone
      });

      if (!result.ok) {
        toast({
          title: "Unable to save facility",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setReadModel(result.data.readModel);
      setIsOpen(false);
      setDraft(toDraft());
      toast({ title: "Facility saved", variant: "success" });
    });
  }

  function handleDelete(facilityId: string) {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const result = await deleteFacilityAction({ orgSlug, facilityId });
      if (!result.ok) {
        toast({
          title: "Unable to delete facility",
          description: result.error,
          variant: "destructive"
        });
        return;
      }
      setReadModel(result.data.readModel);
      toast({ title: "Facility deleted", variant: "success" });
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Facilities</CardTitle>
            <CardDescription>Create and manage visual facility maps used by booking flows.</CardDescription>
          </div>
          <Button
            disabled={!canWrite}
            onClick={() => {
              setDraft(toDraft());
              setIsOpen(true);
            }}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add facility
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSaving ? <Alert variant="info">Saving facilities changes...</Alert> : null}

        {facilities.length === 0 ? <Alert variant="info">No facilities yet. Create your first visual facility map.</Alert> : null}

        {facilities.map((facility) => (
          <div className="ui-list-item flex flex-wrap items-center justify-between gap-3" key={facility.id}>
            <div className="min-w-0">
              <p className="font-semibold text-text">{facility.name}</p>
              <p className="text-xs text-text-muted">
                {facility.facilityType} · {facility.status} · {facility.timezone}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button href={`/${orgSlug}/workspace/facilities/${facility.id}`} size="sm" variant="secondary">
                Open
              </Button>
              <Button
                disabled={!canWrite}
                onClick={() => {
                  setDraft(
                    toDraft({
                      id: facility.id,
                      name: facility.name,
                      facilityType: facility.facilityType,
                      status: facility.status,
                      timezone: facility.timezone
                    })
                  );
                  setIsOpen(true);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button className="text-danger" disabled={!canWrite} onClick={() => handleDelete(facility.id)} size="sm" type="button" variant="ghost">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canWrite || draft.name.trim().length < 2} onClick={handleSave} type="button">
              Save facility
            </Button>
          </>
        }
        onClose={() => setIsOpen(false)}
        open={isOpen}
        subtitle="Top-level real-world location or complex."
        title={draft.facilityId ? "Edit facility" : "Create facility"}
      >
        <div className="space-y-4">
          <FormField label="Facility name">
            <Input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
          </FormField>

          <FormField label="Facility type">
            <Select
              onChange={(event) => setDraft((current) => ({ ...current, facilityType: event.target.value as FacilityType }))}
              options={[
                { value: "complex", label: "Complex" },
                { value: "park", label: "Park" },
                { value: "campus", label: "Campus" },
                { value: "building", label: "Building" },
                { value: "field_cluster", label: "Field cluster" },
                { value: "gym", label: "Gym" },
                { value: "indoor", label: "Indoor" },
                { value: "custom", label: "Custom" }
              ]}
              value={draft.facilityType}
            />
          </FormField>

          <FormField label="Status">
            <Select
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Draft["status"] }))}
              options={[
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
                { value: "archived", label: "Archived" }
              ]}
              value={draft.status}
            />
          </FormField>

          <FormField label="Timezone">
            <Input onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} value={draft.timezone} />
          </FormField>
        </div>
      </Panel>
    </Card>
  );
}
