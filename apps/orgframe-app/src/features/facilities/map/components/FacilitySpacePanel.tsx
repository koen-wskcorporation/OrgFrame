"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { Chip } from "@orgframe/ui/primitives/chip";
import { StatusPicker } from "@orgframe/ui/primitives/status-picker";
import { useToast } from "@orgframe/ui/primitives/toast";
import { deleteFacilitySpaceAction, updateFacilitySpaceAction } from "@/src/features/facilities/actions";
import type { FacilitySpace, FacilitySpaceKind, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import { getSpaceKindIcon, isKindBookable, SPACE_KIND_OPTIONS } from "@/src/features/facilities/lib/spaceKindIcon";

type FacilitySpacePanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  space: FacilitySpace | null;
  canWrite: boolean;
  spaceStatuses: FacilitySpaceStatusDef[];
  /** Fires after a successful server save (or on local commit for pending shapes). */
  onSpaceUpdated: (space: FacilitySpace) => void;
  /**
   * Fires on every field change so the consumer can update the canvas
   * preview (label, icon, hatched fill, etc.) immediately — without
   * waiting for the user to click Save. Distinct from `onSpaceUpdated`
   * which only fires once a save has actually committed.
   */
  onLivePreview?: (space: FacilitySpace) => void;
  onSpaceDeleted: (spaceId: string) => void;
  onManageStatuses?: () => void;
  /**
   * When true, the space hasn't been persisted server-side yet — saves
   * skip the network and just bubble the patched FacilitySpace up via
   * `onSpaceUpdated`. Delete bubbles via `onSpaceDeleted`. Used by the
   * map workspace for shapes still in the unsaved draft.
   */
  isPending?: boolean;
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
  onLivePreview,
  onSpaceDeleted,
  onManageStatuses,
  isPending = false
}: FacilitySpacePanelProps) {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  // Tag the draft with the id of the space it was built from. The pair
  // is the source of truth — if `space.id` ever drifts away from
  // `draft.spaceId` (e.g. parent swapped the panel to a new space and
  // we haven't reset yet), every read defers to the matching `space`
  // until the synchronous reset below catches up.
  const [draftState, setDraftState] = React.useState<{ spaceId: string; values: Draft } | null>(
    space ? { spaceId: space.id, values: toDraft(space) } : null
  );

  // CRITICAL: this MUST run synchronously before paint (useLayoutEffect,
  // not useEffect). Otherwise React paints one frame with the new
  // `space` prop but the OLD draft state — the user clicks Save in
  // that window and the form values from the previously-edited space
  // get sent up keyed to the *new* space's id. That's the bleed.
  React.useLayoutEffect(() => {
    if (!space) {
      setDraftState(null);
      return;
    }
    setDraftState({ spaceId: space.id, values: toDraft(space) });
  }, [space?.id, space?.updatedAt]);

  // The single read of "what does the panel currently show". Falls
  // back to a fresh draft from `space` when the stored draft is for a
  // different (stale) space — protects against the pre-layout-effect
  // render window AND any future drift.
  const draft: Draft | null = React.useMemo(() => {
    if (!space) return null;
    if (draftState && draftState.spaceId === space.id) return draftState.values;
    return toDraft(space);
  }, [space, draftState]);

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

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
    if (!space) return;
    const currentSpaceId = space.id;
    let nextValues: Draft | null = null;
    setDraftState((current) => {
      // Refuse to write into a draft tagged for a different space — this
      // is the sibling guard to the layout-effect reset. Even if a
      // stale change handler somehow fires after we've swapped spaces,
      // it can never write the wrong space's value into the new draft.
      if (current && current.spaceId !== currentSpaceId) {
        nextValues = { ...toDraft(space), [key]: value };
        return { spaceId: currentSpaceId, values: nextValues };
      }
      const base = current?.values ?? toDraft(space);
      nextValues = { ...base, [key]: value };
      return { spaceId: currentSpaceId, values: nextValues };
    });
    // Live preview: tell the parent to repaint the canvas with the new
    // values immediately. Synthesize the patched FacilitySpace so the
    // workspace can route it straight into draft.updateShape — no
    // server round-trip, no waiting for Save.
    if (onLivePreview && nextValues) {
      const values: Draft = nextValues;
      const capacityValue = values.capacity.trim().length > 0
        ? Number.parseInt(values.capacity, 10)
        : null;
      onLivePreview({
        ...space,
        name: values.name,
        slug: values.slug,
        spaceKind: values.spaceKind,
        statusId: values.statusId,
        isBookable: values.isBookable,
        timezone: values.timezone,
        capacity: Number.isFinite(capacityValue ?? NaN) ? (capacityValue as number) : null,
        sortIndex: Number.parseInt(values.sortIndex || "0", 10) || 0
      });
    }
  }

  async function handleSave() {
    if (!space || !draft || !canWrite) return;
    // Final root-cause guard: if for any reason the draft we're about
    // to save isn't tagged for the currently-displayed space, refuse
    // to save. This is the bleed bug — sending one space's form data
    // to another space's id. Better to bail than to silently corrupt.
    if (draftState && draftState.spaceId !== space.id) {
      toast({
        title: "Form was out of sync",
        description: "The panel was switching spaces — please review and try again.",
        variant: "destructive"
      });
      return;
    }
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

      // Pending shapes route their edits through the parent (which
      // patches the in-memory draft). The server save batch picks them
      // up later when the user hits the editor's Save button.
      if (isPending) {
        onSpaceUpdated({
          ...space,
          name: trimmedName,
          slug: draft.slug.trim() || space.slug,
          spaceKind: draft.spaceKind,
          statusId: draft.statusId,
          isBookable: draft.isBookable,
          timezone: draft.timezone.trim() || space.timezone,
          capacity: capacityValue,
          sortIndex: Number.parseInt(draft.sortIndex || "0", 10) || 0
        });
        toast({ title: "Saved to draft", description: "Hit Save in the editor to persist.", variant: "success" });
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
      // Pending shapes never reached the server, so just drop them
      // from the parent draft.
      if (isPending) {
        onSpaceDeleted(space.id);
        onClose();
        return;
      }
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

  // Read kind/status from the live draft so the title icon and chip
  // both update the moment the user picks a new value, before they hit
  // Save. Falls back to `space` for the no-edits-yet case.
  const liveStatusId = draft?.statusId ?? space?.statusId ?? null;
  const liveSpaceKind = draft?.spaceKind ?? space?.spaceKind;
  const currentStatusDef = liveStatusId ? spaceStatuses.find((s) => s.id === liveStatusId) ?? null : null;
  const KindIcon = liveSpaceKind ? getSpaceKindIcon(liveSpaceKind) : null;
  // Status is meaningless on a non-bookable space — there's nothing to
  // be "open" or "closed" against. The check is on the kind first
  // (intrinsic non-bookability — bathrooms never have status) and
  // falls back to the live `isBookable` flag for ambiguous kinds.
  const showStatus = Boolean(
    (draft?.spaceKind && isKindBookable(draft.spaceKind)) || (space?.spaceKind && isKindBookable(space.spaceKind))
  ) && Boolean(draft?.isBookable ?? space?.isBookable);
  const titleNode = space ? (
    <div className="flex min-w-0 items-center gap-2">
      {KindIcon ? <KindIcon className="h-4 w-4 shrink-0 text-text-muted" /> : null}
      <span className="min-w-0 truncate">{draft?.name ?? space.name}</span>
      {showStatus && currentStatusDef ? (
        <Chip color={currentStatusDef.color} label={currentStatusDef.label} size="sm" status={true} />
      ) : null}
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

          <div className={`grid gap-3 ${isKindBookable(draft.spaceKind) ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
            <FormField label="Kind">
              <Select
                disabled={!canWrite}
                onChange={(event) => {
                  const nextKind = event.target.value as FacilitySpaceKind;
                  setField("spaceKind", nextKind);
                  // Force `isBookable` and `statusId` to match the
                  // kind's intrinsic bookability. A bathroom is never
                  // bookable AND never has a status — switching to
                  // bathroom clears both. Switching back to a bookable
                  // kind defaults `isBookable` true and leaves status
                  // empty for the user to pick.
                  if (!isKindBookable(nextKind)) {
                    if (draft.isBookable) setField("isBookable", false);
                    if (draft.statusId) setField("statusId", null);
                  } else if (!draft.isBookable && !isKindBookable(draft.spaceKind)) {
                    setField("isBookable", true);
                  }
                }}
                options={SPACE_KIND_OPTIONS}
                value={draft.spaceKind}
              />
            </FormField>
            {/* Status only exists for bookable kinds. For bathrooms /
                parking / storage we hide the field entirely — there's
                nothing to be "open" or "closed" against. The toggle
                check is on the kind, not the per-row `isBookable`,
                so old data with `is_bookable=true` on a non-bookable
                kind still hides the picker. */}
            {isKindBookable(draft.spaceKind) ? (
              <FormField
                label="Status"
                hint={!draft.isBookable ? "Mark this space bookable to assign a status." : undefined}
              >
                <StatusPicker
                  disabled={!canWrite || !draft.isBookable}
                  onChange={(value) => setField("statusId", value)}
                  onManage={onManageStatuses}
                  options={pickerOptions}
                  value={draft.isBookable ? draft.statusId : null}
                />
              </FormField>
            ) : null}
          </div>

          {/* Only surface the Bookable toggle for kinds that can be
              booked at all. Bathrooms / parking lots / storage are
              infrastructure — there's nothing to reserve, so we don't
              even offer the option. The kind itself is the gate. */}
          {isKindBookable(draft.spaceKind) ? (
            <label className="ui-inline-toggle">
              <Checkbox
                checked={draft.isBookable}
                disabled={!canWrite}
                onChange={(event) => setField("isBookable", event.target.checked)}
              />
              Bookable space
            </label>
          ) : null}

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
