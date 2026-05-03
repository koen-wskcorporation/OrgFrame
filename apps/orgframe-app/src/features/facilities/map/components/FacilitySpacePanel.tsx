"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { StatusChip } from "@orgframe/ui/primitives/status-chip";
import { StatusPicker } from "@orgframe/ui/primitives/status-picker";
import { useToast } from "@orgframe/ui/primitives/toast";
import { deleteFacilitySpaceAction, updateFacilitySpaceAction } from "@/src/features/facilities/actions";
import type { FacilitySpace, FacilitySpaceKind, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import { getSpaceKindIcon, SPACE_KIND_OPTIONS } from "@/src/features/facilities/lib/spaceKindIcon";

type FacilitySpacePanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  space: FacilitySpace | null;
  canWrite: boolean;
  spaceStatuses: FacilitySpaceStatusDef[];
  onSpaceUpdated: (space: FacilitySpace) => void;
  onSpaceDeleted: (spaceId: string) => void;
  onManageStatuses?: () => void;
};

type Draft = {
  name: string;
  slug: string;
  spaceKind: FacilitySpaceKind;
  statusId: string | null;
  isBookable: boolean;
  timezone: string;
  capacity: string;
  sortIndex: string;
};

function toDraft(space: FacilitySpace): Draft {
  return {
    name: space.name,
    slug: space.slug,
    spaceKind: space.spaceKind,
    statusId: space.statusId ?? null,
    isBookable: space.isBookable,
    timezone: space.timezone,
    capacity: space.capacity != null ? String(space.capacity) : "",
    sortIndex: space.sortIndex != null ? String(space.sortIndex) : "0"
  };
}

export function FacilitySpacePanel({
  open,
  onClose,
  orgSlug,
  space,
  canWrite,
  spaceStatuses,
  onSpaceUpdated,
  onSpaceDeleted,
  onManageStatuses
}: FacilitySpacePanelProps) {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [draft, setDraft] = React.useState<Draft | null>(space ? toDraft(space) : null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (space) {
      setDraft(toDraft(space));
    } else {
      setDraft(null);
    }
  }, [space?.id, space?.updatedAt]);

  const isDirty = React.useMemo(() => {
    if (!space || !draft) return false;
    const original = toDraft(space);
    return (
      draft.name !== original.name ||
      draft.spaceKind !== original.spaceKind ||
      draft.statusId !== original.statusId ||
      draft.isBookable !== original.isBookable ||
      draft.timezone !== original.timezone ||
      draft.capacity !== original.capacity ||
      draft.sortIndex !== original.sortIndex
    );
  }, [draft, space]);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSave() {
    if (!space || !draft || !canWrite) return;
    setSaving(true);
    try {
      const trimmedName = draft.name.trim();
      if (trimmedName.length < 2) {
        toast({ title: "Name is required", description: "Use at least 2 characters.", variant: "destructive" });
        return;
      }

      const capacityValue = draft.capacity.trim().length > 0 ? Number.parseInt(draft.capacity, 10) : null;
      if (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 0)) {
        toast({ title: "Capacity must be a non-negative number", variant: "destructive" });
        return;
      }

      const result = await updateFacilitySpaceAction({
        orgSlug,
        spaceId: space.id,
        parentSpaceId: space.parentSpaceId,
        name: trimmedName,
        slug: draft.slug.trim() || space.slug,
        spaceKind: draft.spaceKind,
        statusId: draft.statusId,
        isBookable: draft.isBookable,
        timezone: draft.timezone.trim() || space.timezone,
        capacity: capacityValue,
        sortIndex: Number.parseInt(draft.sortIndex || "0", 10) || 0
      });

      if (!result.ok) {
        toast({ title: "Couldn't save space", description: result.error, variant: "destructive" });
        return;
      }

      const updatedSpace = result.data.readModel.spaces.find((candidate) => candidate.id === space.id);
      if (updatedSpace) {
        onSpaceUpdated(updatedSpace);
      }
      toast({ title: "Space saved", variant: "success" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!space || !canWrite) return;
    const confirmed = await confirm({
      title: `Delete "${space.name}"?`,
      description: "This permanently removes the space from your facility, along with its polygon on the map. This can't be undone.",
      confirmLabel: "Delete space",
      cancelLabel: "Cancel",
      variant: "destructive"
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const result = await deleteFacilitySpaceAction({ orgSlug, spaceId: space.id });
      if (!result.ok) {
        toast({ title: "Couldn't delete space", description: result.error, variant: "destructive" });
        return;
      }
      onSpaceDeleted(space.id);
      onClose();
      toast({ title: "Space deleted", variant: "success" });
    } finally {
      setDeleting(false);
    }
  }

  const currentStatusDef = space ? spaceStatuses.find((s) => s.id === space.statusId) ?? null : null;
  const KindIcon = space ? getSpaceKindIcon(space.spaceKind) : null;
  const titleNode = space ? (
    <div className="flex min-w-0 items-center gap-2">
      {KindIcon ? <KindIcon className="h-4 w-4 shrink-0 text-text-muted" /> : null}
      <span className="min-w-0 truncate">{space.name}</span>
      {currentStatusDef ? <StatusChip color={currentStatusDef.color} label={currentStatusDef.label} size="sm" /> : null}
    </div>
  ) : (
    "Space"
  );

  const pickerOptions = React.useMemo(
    () => spaceStatuses.map((status) => ({ value: status.id, label: status.label, color: status.color })),
    [spaceStatuses]
  );

  return (
    <Panel
      footer={
        space ? (
          <div className="flex w-full items-center justify-end gap-2">
            <Button onClick={onClose} variant="ghost">
              Close
            </Button>
            <Button disabled={!canWrite || saving || !isDirty} loading={saving} onClick={handleSave} variant="primary">
              Save changes
            </Button>
          </div>
        ) : null
      }
      onClose={onClose}
      open={open}
      subtitle={space ? `${space.spaceKind} · ${space.slug}` : undefined}
      title={titleNode}
    >
      {!space || !draft ? (
        <p className="text-sm text-text-muted">Select a shape on the map to edit its space.</p>
      ) : (
        <div className="space-y-4">
          <FormField label="Name">
            <Input disabled={!canWrite} onChange={(event) => setField("name", event.target.value)} value={draft.name} />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Kind">
              <Select
                disabled={!canWrite}
                onChange={(event) => setField("spaceKind", event.target.value as FacilitySpaceKind)}
                options={SPACE_KIND_OPTIONS}
                value={draft.spaceKind}
              />
            </FormField>
            <FormField label="Status">
              <StatusPicker
                disabled={!canWrite}
                onChange={(value) => setField("statusId", value)}
                onManage={onManageStatuses}
                options={pickerOptions}
                value={draft.statusId}
              />
            </FormField>
          </div>

          <label className="ui-inline-toggle">
            <Checkbox
              checked={draft.isBookable}
              disabled={!canWrite}
              onChange={(event) => setField("isBookable", event.target.checked)}
            />
            Bookable space
          </label>

          <div className="rounded-control border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Danger zone</p>
            <p className="mt-1 text-xs text-text-muted">Permanently removes the space and its polygon. This can't be undone.</p>
            <div className="mt-3">
              <Button disabled={!canWrite || deleting} loading={deleting} onClick={handleDelete} variant="danger">
                Delete space
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
