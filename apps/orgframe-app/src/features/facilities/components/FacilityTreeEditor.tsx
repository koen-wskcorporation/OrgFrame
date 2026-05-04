"use client";

import { useMemo, useState } from "react";
import { Archive, Plus, Save } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { ContextPanel, CreateModal } from "@orgframe/ui/primitives/interaction-containers";
import { Select } from "@orgframe/ui/primitives/select";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { formatFacilitySpaceStatusLabel, resolveFacilitySpaceStatusLabels } from "@/src/features/facilities/status";
import type { FacilitySpace, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import { FacilityStatusBadge } from "@/src/features/facilities/components/FacilityStatusBadge";

type SpaceDraft = {
  spaceId?: string;
  parentSpaceId: string;
  name: string;
  slug: string;
  spaceKind: FacilitySpace["spaceKind"];
  status: FacilitySpace["status"];
  statusLabelOpen: string;
  statusLabelClosed: string;
  statusLabelArchived: string;
  isBookable: boolean;
  timezone: string;
  capacity: string;
  sortIndex: string;
};

type FacilityTreeEditorProps = {
  orgSlug?: string;
  spaces: FacilitySpace[];
  canWrite: boolean;
  onCreateSpace: (input: {
    parentSpaceId: string | null;
    name: string;
    slug: string;
    spaceKind: FacilitySpace["spaceKind"];
    status: FacilitySpace["status"];
    statusLabels?: Partial<Record<FacilitySpace["status"], string>>;
    isBookable: boolean;
    timezone: string;
    capacity: number | null;
    sortIndex: number;
  }) => void;
  onUpdateSpace: (input: {
    spaceId: string;
    parentSpaceId: string | null;
    name: string;
    slug: string;
    spaceKind: FacilitySpace["spaceKind"];
    status: FacilitySpace["status"];
    statusLabels?: Partial<Record<FacilitySpace["status"], string>>;
    isBookable: boolean;
    timezone: string;
    capacity: number | null;
    sortIndex: number;
  }) => void;
  onArchiveSpace: (spaceId: string) => void;
  onToggleBookable: (spaceId: string, isBookable: boolean) => void;
  onSetStatus: (spaceId: string, status: FacilitySpace["status"]) => void;
  spaceStatuses: FacilitySpaceStatusDef[];
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toDraft(space?: FacilitySpace | null): SpaceDraft {
  const statusLabels = space ? resolveFacilitySpaceStatusLabels(space) : {};

  return {
    spaceId: space?.id,
    parentSpaceId: space?.parentSpaceId ?? "",
    name: space?.name ?? "",
    slug: space?.slug ?? "",
    spaceKind: space?.spaceKind ?? "custom",
    status: space?.status ?? "open",
    statusLabelOpen: statusLabels.open ?? "",
    statusLabelClosed: statusLabels.closed ?? "",
    statusLabelArchived: statusLabels.archived ?? "",
    isBookable: space?.isBookable ?? true,
    timezone: space?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    capacity: space?.capacity?.toString() ?? "",
    sortIndex: space?.sortIndex?.toString() ?? "0"
  };
}

function sortedSpaces(spaces: FacilitySpace[]) {
  return [...spaces].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
}

function renderTree(
  orgSlug: string | undefined,
  spaces: FacilitySpace[],
  parentId: string | null,
  depth: number,
  onEdit: (space: FacilitySpace) => void,
  onArchive: (spaceId: string) => void,
  onToggleBookable: (space: FacilitySpace) => void,
  onSetStatus: (space: FacilitySpace, status: FacilitySpace["status"]) => void,
  canWrite: boolean,
  spaceStatuses: FacilitySpaceStatusDef[]
) {
  return spaces
    .filter((space) => space.parentSpaceId === parentId)
    .map((space) => (
      <div className="space-y-2" key={space.id}>
        <div
          className="ui-list-row ui-list-row-hover"
          style={{
            marginLeft: `${depth * 12}px`
          }}
        >
          <div className="ui-list-row-content">
            {(() => {
              const statusLabels = resolveFacilitySpaceStatusLabels(space);
              return (
                <div className="flex items-center gap-2">
                  <p className="ui-list-row-title">{space.name}</p>
                  <FacilityStatusBadge
                    disabled={!canWrite}
                    label={formatFacilitySpaceStatusLabel(space.status, statusLabels)}
                    onSelectSpaceStatus={(nextStatus) => onSetStatus(space, nextStatus)}
                    spaceStatuses={spaceStatuses}
                    status={space.status}
                  />
                </div>
              );
            })()}
            <p className="ui-list-row-meta">
              {space.spaceKind} · {space.isBookable ? "Bookable" : "Not bookable"}
            </p>
            {orgSlug ? <p className="mt-1 text-sm text-text-muted">/{orgSlug}/manage/facilities/{space.id}</p> : null}
          </div>

          <div className="ui-list-row-actions">
            {orgSlug ? (
              <Button href={`/manage/facilities/${space.id}`} size="sm" variant="secondary">
                Manage
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <Button onClick={() => onEdit(space)} size="sm" type="button" variant="ghost">
                  Edit
                </Button>
                <Button onClick={() => onToggleBookable(space)} size="sm" type="button" variant="ghost">
                  {space.isBookable ? "Mark Not Bookable" : "Mark Bookable"}
                </Button>
                <Button
                  className="ui-button-danger"
                  disabled={space.status === "archived"}
                  onClick={() => onArchive(space.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {renderTree(orgSlug, spaces, space.id, depth + 1, onEdit, onArchive, onToggleBookable, onSetStatus, canWrite, spaceStatuses)}
      </div>
    ));
}

export function FacilityTreeEditor({
  orgSlug,
  spaces,
  canWrite,
  onCreateSpace,
  onUpdateSpace,
  onArchiveSpace,
  onToggleBookable,
  onSetStatus,
  spaceStatuses
}: FacilityTreeEditorProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draft, setDraft] = useState<SpaceDraft>(() => toDraft());
  const allSpaces = useMemo(() => sortedSpaces(spaces), [spaces]);

  function openCreatePanel() {
    setDraft(toDraft());
    setIsEditorOpen(true);
  }

  function openEditPanel(space: FacilitySpace) {
    setDraft(toDraft(space));
    setIsEditorOpen(true);
  }

  function submitDraft() {
    if (!canWrite) {
      return;
    }

    const payload = {
      parentSpaceId: draft.parentSpaceId || null,
      name: draft.name.trim(),
      slug: draft.slug.trim(),
      spaceKind: draft.spaceKind,
      status: draft.status,
      statusLabels: {
        open: draft.statusLabelOpen,
        closed: draft.statusLabelClosed,
        archived: draft.statusLabelArchived
      },
      isBookable: draft.isBookable,
      timezone: draft.timezone.trim(),
      capacity: draft.capacity.trim().length > 0 ? Number.parseInt(draft.capacity, 10) : null,
      sortIndex: Number.parseInt(draft.sortIndex || "0", 10) || 0
    };

    if (draft.spaceId) {
      onUpdateSpace({
        spaceId: draft.spaceId,
        ...payload
      });
    } else {
      onCreateSpace(payload);
    }

    setIsEditorOpen(false);
  }

  const createMode = !draft.spaceId;
  const editorFooter = (
    <>
      <Button onClick={() => setIsEditorOpen(false)} type="button" variant="ghost">
        Cancel
      </Button>
      <Button disabled={!canWrite || draft.name.trim().length < 2} onClick={submitDraft} type="button">
        <Save className="h-4 w-4" />
        {createMode ? "Create space" : "Save space"}
      </Button>
    </>
  );
  const editorBody = (
    <div className="space-y-4">
      <FormField label="Name">
        <Input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
      </FormField>
      <FormField hint="Optional, auto-generated server-side if blank." label="Slug">
        <Input
          onChange={(event) => setDraft((current) => ({ ...current, slug: slugify(event.target.value) }))}
          onSlugAutoChange={(value) => {
            if (draft.spaceId) {
              return;
            }

            setDraft((current) => ({ ...current, slug: value }));
          }}
          slugAutoEnabled={!draft.spaceId}
          slugAutoSource={draft.name}
          value={draft.slug}
        />
      </FormField>
      <FormField label="Parent">
        <Select
          onChange={(event) => setDraft((current) => ({ ...current, parentSpaceId: event.target.value }))}
          options={[
            { value: "", label: "No parent (root space)" },
            ...allSpaces
              .filter((space) => space.id !== draft.spaceId)
              .map((space) => ({
                value: space.id,
                label: `${space.name} (${space.spaceKind})`
              }))
          ]}
          value={draft.parentSpaceId}
        />
      </FormField>
      <FormField label="Space kind">
        <Select
          onChange={(event) => setDraft((current) => ({ ...current, spaceKind: event.target.value as FacilitySpace["spaceKind"] }))}
          options={[
            { value: "building", label: "Building" },
            { value: "floor", label: "Floor" },
            { value: "room", label: "Room" },
            { value: "field", label: "Field" },
            { value: "court", label: "Court" },
            { value: "custom", label: "Custom" }
          ]}
          value={draft.spaceKind}
        />
      </FormField>
      <FormField label="Status">
        <Select
          onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as FacilitySpace["status"] }))}
          options={[
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
            { value: "archived", label: "Archived" }
          ]}
          value={draft.status}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField hint="Optional label shown for Open." label="Custom Open Status">
          <Input onChange={(event) => setDraft((current) => ({ ...current, statusLabelOpen: event.target.value }))} value={draft.statusLabelOpen} />
        </FormField>
        <FormField hint="Optional label shown for Closed." label="Custom Closed Status">
          <Input onChange={(event) => setDraft((current) => ({ ...current, statusLabelClosed: event.target.value }))} value={draft.statusLabelClosed} />
        </FormField>
        <FormField hint="Optional label shown for Archived." label="Custom Archived Status">
          <Input onChange={(event) => setDraft((current) => ({ ...current, statusLabelArchived: event.target.value }))} value={draft.statusLabelArchived} />
        </FormField>
      </div>
      <FormField label="Timezone">
        <Input onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} value={draft.timezone} />
      </FormField>
      <FormField hint="Optional" label="Capacity">
        <Input onChange={(event) => setDraft((current) => ({ ...current, capacity: event.target.value }))} type="number" value={draft.capacity} />
      </FormField>
      <FormField label="Sort index">
        <Input onChange={(event) => setDraft((current) => ({ ...current, sortIndex: event.target.value }))} type="number" value={draft.sortIndex} />
      </FormField>
      <label className="ui-inline-toggle">
        <Checkbox
          checked={draft.isBookable}
          onChange={(event) => setDraft((current) => ({ ...current, isBookable: event.target.checked }))}
        />
        Bookable space
      </label>
    </div>
  );

  return (
    <ManageSection
      actions={
        <Button disabled={!canWrite} onClick={openCreatePanel} type="button">
          <Plus className="h-4 w-4" />
          Add Space
        </Button>
      }
      contentClassName="ui-list-stack"
      description="Build a deep hierarchy across buildings, floors, rooms, fields, courts, and custom spaces."
      title="Facility Spaces"
    >
        {allSpaces.length === 0 ? <Alert variant="info">No spaces yet.</Alert> : null}
        {renderTree(
          orgSlug,
          allSpaces,
          null,
          0,
          openEditPanel,
          onArchiveSpace,
          (space) => onToggleBookable(space.id, !space.isBookable),
          (space, status) => onSetStatus(space.id, status),
          canWrite,
          spaceStatuses
        )}
      

      <CreateModal
        footer={editorFooter}
        onClose={() => setIsEditorOpen(false)}
        open={isEditorOpen && createMode}
        subtitle="Assign hierarchy, status, and booking behavior for this space."
        title="Add space"
      >
        {editorBody}
      </CreateModal>

      <ContextPanel
        footer={editorFooter}
        onClose={() => setIsEditorOpen(false)}
        open={isEditorOpen && !createMode}
        subtitle="Assign hierarchy, status, and booking behavior for this space."
        title="Edit space"
      >
        {editorBody}
      </ContextPanel>
    </ManageSection>
  );
}
