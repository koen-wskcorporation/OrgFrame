"use client";

import { useMemo, useState } from "react";
import { Archive, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { FacilitySpace } from "@/modules/facilities/types";
import { FacilityStatusBadge } from "@/modules/facilities/components/FacilityStatusBadge";

type SpaceDraft = {
  spaceId?: string;
  parentSpaceId: string;
  name: string;
  slug: string;
  spaceKind: FacilitySpace["spaceKind"];
  status: FacilitySpace["status"];
  isBookable: boolean;
  timezone: string;
  capacity: string;
  sortIndex: string;
};

type FacilityTreeEditorProps = {
  spaces: FacilitySpace[];
  canWrite: boolean;
  onCreateSpace: (input: {
    parentSpaceId: string | null;
    name: string;
    slug: string;
    spaceKind: FacilitySpace["spaceKind"];
    status: FacilitySpace["status"];
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
    isBookable: boolean;
    timezone: string;
    capacity: number | null;
    sortIndex: number;
  }) => void;
  onArchiveSpace: (spaceId: string) => void;
  onToggleBookable: (spaceId: string, isBookable: boolean) => void;
  onToggleOpenClosed: (spaceId: string, status: "open" | "closed") => void;
};

function toDraft(space?: FacilitySpace | null): SpaceDraft {
  return {
    spaceId: space?.id,
    parentSpaceId: space?.parentSpaceId ?? "",
    name: space?.name ?? "",
    slug: space?.slug ?? "",
    spaceKind: space?.spaceKind ?? "custom",
    status: space?.status ?? "open",
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
  spaces: FacilitySpace[],
  parentId: string | null,
  depth: number,
  onEdit: (space: FacilitySpace) => void,
  onArchive: (spaceId: string) => void,
  onToggleBookable: (space: FacilitySpace) => void,
  onToggleOpenClosed: (space: FacilitySpace) => void,
  canWrite: boolean
) {
  return spaces
    .filter((space) => space.parentSpaceId === parentId)
    .map((space) => (
      <div className="space-y-2" key={space.id}>
        <div
          className="flex flex-wrap items-center gap-2 rounded-control border bg-surface px-3 py-2"
          style={{
            marginLeft: `${depth * 12}px`
          }}
        >
          <p className="font-medium text-text">{space.name}</p>
          <span className="text-xs text-text-muted">{space.spaceKind}</span>
          <FacilityStatusBadge status={space.status} />
          <span className="text-xs text-text-muted">{space.isBookable ? "Bookable" : "Not bookable"}</span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => onEdit(space)} size="sm" type="button" variant="secondary">
              Edit
            </Button>
            <Button
              disabled={!canWrite || space.status === "archived"}
              onClick={() => onToggleOpenClosed(space)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {space.status === "open" ? "Close" : "Open"}
            </Button>
            <Button disabled={!canWrite} onClick={() => onToggleBookable(space)} size="sm" type="button" variant="secondary">
              {space.isBookable ? "Set non-bookable" : "Set bookable"}
            </Button>
            <Button disabled={!canWrite || space.status === "archived"} onClick={() => onArchive(space.id)} size="sm" type="button" variant="ghost">
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          </div>
        </div>
        {renderTree(spaces, space.id, depth + 1, onEdit, onArchive, onToggleBookable, onToggleOpenClosed, canWrite)}
      </div>
    ));
}

export function FacilityTreeEditor({
  spaces,
  canWrite,
  onCreateSpace,
  onUpdateSpace,
  onArchiveSpace,
  onToggleBookable,
  onToggleOpenClosed
}: FacilityTreeEditorProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [draft, setDraft] = useState<SpaceDraft>(() => toDraft());
  const allSpaces = useMemo(() => sortedSpaces(spaces), [spaces]);

  function openCreatePanel() {
    setDraft(toDraft());
    setIsPanelOpen(true);
  }

  function openEditPanel(space: FacilitySpace) {
    setDraft(toDraft(space));
    setIsPanelOpen(true);
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

    setIsPanelOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Facility Spaces</CardTitle>
          <Button disabled={!canWrite} onClick={openCreatePanel} type="button">
            <Plus className="h-4 w-4" />
            Add space
          </Button>
        </div>
        <CardDescription>Build a deep hierarchy across buildings, rooms, fields, courts, and custom spaces.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {allSpaces.length === 0 ? <p className="text-sm text-text-muted">No spaces yet.</p> : null}
        {renderTree(
          allSpaces,
          null,
          0,
          openEditPanel,
          onArchiveSpace,
          (space) => onToggleBookable(space.id, !space.isBookable),
          (space) => onToggleOpenClosed(space.id, space.status === "open" ? "closed" : "open"),
          canWrite
        )}
      </CardContent>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsPanelOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canWrite || draft.name.trim().length < 2} onClick={submitDraft} type="button">
              <Save className="h-4 w-4" />
              Save space
            </Button>
          </>
        }
        onClose={() => setIsPanelOpen(false)}
        open={isPanelOpen}
        subtitle="Assign hierarchy, status, and booking behavior for this space."
        title={draft.spaceId ? "Edit space" : "Add space"}
      >
        <div className="space-y-4">
          <FormField label="Name">
            <Input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
          </FormField>
          <FormField hint="Optional, auto-generated server-side if blank." label="Slug">
            <Input onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))} value={draft.slug} />
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
          <FormField label="Timezone">
            <Input onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} value={draft.timezone} />
          </FormField>
          <FormField hint="Optional" label="Capacity">
            <Input onChange={(event) => setDraft((current) => ({ ...current, capacity: event.target.value }))} type="number" value={draft.capacity} />
          </FormField>
          <FormField label="Sort index">
            <Input onChange={(event) => setDraft((current) => ({ ...current, sortIndex: event.target.value }))} type="number" value={draft.sortIndex} />
          </FormField>
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
            <Checkbox
              checked={draft.isBookable}
              onChange={(event) => setDraft((current) => ({ ...current, isBookable: event.target.checked }))}
            />
            Bookable space
          </label>
        </div>
      </Panel>
    </Card>
  );
}
