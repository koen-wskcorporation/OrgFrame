"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useRouter } from "next/navigation";
import { archiveFacilitySpaceAction, updateFacilitySpaceAction } from "@/src/features/facilities/actions";
import type { FacilitySpace } from "@/src/features/facilities/types";

type FacilitySettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  space: FacilitySpace;
  canWrite: boolean;
  onSpaceUpdated: (space: FacilitySpace) => void;
};

type Draft = {
  name: string;
  slug: string;
  isBookable: boolean;
};

function toDraft(space: FacilitySpace): Draft {
  return {
    name: space.name,
    slug: space.slug,
    isBookable: space.isBookable
  };
}

export function FacilitySettingsPanel({ open, onClose, orgSlug, space, canWrite, onSpaceUpdated }: FacilitySettingsPanelProps) {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(toDraft(space));
  const [saving, setSaving] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);

  React.useEffect(() => {
    setDraft(toDraft(space));
  }, [space.id, space.updatedAt]);

  const isDirty =
    draft.name !== space.name || draft.slug !== space.slug || draft.isBookable !== space.isBookable;

  async function handleSave() {
    if (!canWrite || !isDirty) return;
    const trimmedName = draft.name.trim();
    if (trimmedName.length < 2) {
      toast({ title: "Name is required", description: "Use at least 2 characters.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const result = await updateFacilitySpaceAction({
        orgSlug,
        spaceId: space.id,
        parentSpaceId: space.parentSpaceId,
        name: trimmedName,
        slug: draft.slug.trim() || space.slug,
        spaceKind: space.spaceKind,
        statusId: space.statusId,
        isBookable: draft.isBookable,
        timezone: space.timezone,
        capacity: space.capacity,
        sortIndex: space.sortIndex
      });

      if (!result.ok) {
        toast({ title: "Couldn't save", description: result.error, variant: "destructive" });
        return;
      }

      const updated = result.data.readModel.spaces.find((s) => s.id === space.id);
      if (updated) onSpaceUpdated(updated);
      toast({ title: "Facility saved", variant: "success" });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!canWrite) return;
    const confirmed = await confirm({
      title: `Archive "${space.name}"?`,
      description: "This hides the facility from active lists. You can restore it later.",
      confirmLabel: "Archive facility",
      cancelLabel: "Cancel",
      variant: "destructive"
    });
    if (!confirmed) return;

    setArchiving(true);
    try {
      const result = await archiveFacilitySpaceAction({ orgSlug, spaceId: space.id });
      if (!result.ok) {
        toast({ title: "Couldn't archive", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Facility archived", variant: "success" });
      onClose();
      router.push(`/${orgSlug}/manage/facilities`);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Panel
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
          <Button disabled={!canWrite || saving || !isDirty} loading={saving} onClick={handleSave} variant="primary">
            Save changes
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      subtitle="Edit facility details and lifecycle."
      title="Facility settings"
    >
      <div className="space-y-4">
        <FormField label="Name">
          <Input
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            value={draft.name}
          />
        </FormField>

        <FormField hint="Used in URLs. Must be unique within your organization." label="Slug">
          <Input
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
            value={draft.slug}
          />
        </FormField>

        <label className="ui-inline-toggle">
          <Checkbox
            checked={draft.isBookable}
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, isBookable: event.target.checked }))}
          />
          Bookable facility
        </label>

        <div className="rounded-control border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Danger zone</p>
          <p className="mt-1 text-xs text-text-muted">Archiving hides this facility from active lists.</p>
          <div className="mt-3">
            <Button disabled={!canWrite || archiving} loading={archiving} onClick={handleArchive} variant="danger">
              Archive facility
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
