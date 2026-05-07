"use client";

import * as React from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Select } from "@orgframe/ui/primitives/select";
import { Chip } from "@orgframe/ui/primitives/chip";
import { STATUS_COLORS, type StatusColor } from "@orgframe/ui/primitives/status-palette";
import { useToast } from "@orgframe/ui/primitives/toast";
import {
  createFacilitySpaceStatusAction,
  deleteFacilitySpaceStatusAction,
  updateFacilitySpaceStatusAction
} from "@/src/features/facilities/actions";
import type { FacilityReservationReadModel, FacilitySpaceStatus, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import { cn } from "@orgframe/ui/primitives/utils";

type SpaceStatusManagerProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  statuses: FacilitySpaceStatusDef[];
  canWrite: boolean;
  onReadModel: (next: FacilityReservationReadModel) => void;
};

type DraftState = {
  mode: "edit" | "create";
  statusId: string | null;
  label: string;
  color: StatusColor;
  behavesAs: FacilitySpaceStatus;
};

const BEHAVES_AS_OPTIONS = [
  { value: "open", label: "Open — bookable" },
  { value: "closed", label: "Closed — not bookable" }
];

function emptyDraft(): DraftState {
  return { mode: "create", statusId: null, label: "", color: "sky", behavesAs: "open" };
}

function fromExisting(status: FacilitySpaceStatusDef): DraftState {
  return {
    mode: "edit",
    statusId: status.id,
    label: status.label,
    color: (status.color as StatusColor) ?? "slate",
    behavesAs: status.behavesAs ?? "open"
  };
}

export function SpaceStatusManager({ open, onClose, orgSlug, statuses, canWrite, onReadModel }: SpaceStatusManagerProps) {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [draft, setDraft] = React.useState<DraftState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [reassignTo, setReassignTo] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) {
      setDraft(null);
      setReassignTo("");
    }
  }, [open]);

  const editing = draft?.statusId
    ? statuses.find((s) => s.id === draft.statusId) ?? null
    : null;
  const isSystem = editing?.isSystem ?? false;

  function startCreate() {
    if (!canWrite) return;
    setDraft(emptyDraft());
  }

  function startEdit(status: FacilitySpaceStatusDef) {
    setDraft(fromExisting(status));
  }

  function cancelDraft() {
    setDraft(null);
  }

  async function handleSave() {
    if (!draft || !canWrite) return;
    const trimmed = draft.label.trim();
    if (trimmed.length < 1) {
      toast({ title: "Label is required", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const result = draft.mode === "create"
        ? await createFacilitySpaceStatusAction({
            orgSlug,
            label: trimmed,
            color: draft.color,
            behavesAs: draft.behavesAs
          })
        : await updateFacilitySpaceStatusAction({
            orgSlug,
            statusId: draft.statusId!,
            label: trimmed,
            color: draft.color,
            behavesAs: draft.behavesAs
          });

      if (!result.ok) {
        toast({ title: "Couldn't save status", description: result.error, variant: "destructive" });
        return;
      }
      onReadModel(result.data.readModel);
      toast({ title: draft.mode === "create" ? "Status added" : "Status updated", variant: "success" });
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(status: FacilitySpaceStatusDef) {
    if (!canWrite || status.isSystem) return;
    const confirmed = await confirm({
      title: `Delete "${status.label}"?`,
      description: "Spaces using this status will need a replacement assigned. This can't be undone.",
      confirmLabel: "Delete status",
      cancelLabel: "Cancel",
      variant: "destructive"
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const firstAttempt = await deleteFacilitySpaceStatusAction({ orgSlug, statusId: status.id });
      if (firstAttempt.ok) {
        onReadModel(firstAttempt.data.readModel);
        toast({ title: "Status deleted", variant: "success" });
        return;
      }

      // Spaces are still using it — ask for a replacement.
      const candidates = statuses.filter((s) => s.id !== status.id);
      if (candidates.length === 0) {
        toast({ title: "Couldn't delete", description: "No replacement status available.", variant: "destructive" });
        return;
      }
      const fallback = candidates.find((s) => s.isSystem && s.behavesAs === status.behavesAs) ?? candidates[0];
      setReassignTo(fallback.id);
      toast({
        title: "Reassign required",
        description: firstAttempt.error,
        variant: "destructive"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup
      onClose={onClose}
      open={open}
      size="sm"
      subtitle="Customize the status chips that appear on facility spaces."
      title="Facility space statuses"
    >
      <div className="space-y-4">
        {!canWrite ? <Alert variant="info">You have read-only access — editing is disabled.</Alert> : null}

        <ul className="divide-y rounded-card border bg-surface">
          {statuses.map((status) => {
            const isEditing = draft?.statusId === status.id;
            return (
              <li className={cn("p-3", isEditing ? "bg-surface-muted" : "")} key={status.id}>
                {isEditing && draft ? (
                  <StatusEditor
                    busy={busy}
                    canWrite={canWrite}
                    isSystem={isSystem}
                    onCancel={cancelDraft}
                    onChange={setDraft}
                    onSave={handleSave}
                    state={draft}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <Chip color={status.color} label={status.label} status={true} />
                    <span className="flex-1 text-xs text-text-muted">
                      {status.isSystem ? "System · " : ""}Behaves as <strong className="text-text">{status.behavesAs}</strong>
                    </span>
                    <Button disabled={!canWrite || busy} iconOnly aria-label={`Edit ${status.label}`} onClick={() => startEdit(status)}>
                      <Pencil />
                    </Button>
                    {status.isSystem ? null : (
                      <Button disabled={!canWrite || busy} iconOnly aria-label={`Delete ${status.label}`} onClick={() => handleDelete(status)}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {draft?.mode === "create" ? (
          <div className="rounded-card border bg-surface p-3">
            <StatusEditor
              busy={busy}
              canWrite={canWrite}
              isSystem={false}
              onCancel={cancelDraft}
              onChange={setDraft}
              onSave={handleSave}
              state={draft}
            />
          </div>
        ) : (
          <Button disabled={!canWrite || busy} onClick={startCreate} variant="secondary">
            <Plus />
            Add status
          </Button>
        )}

        {reassignTo ? (
          <Alert variant="info">
            Pick a replacement and re-try delete. Reassignment UI is coming soon — for now, edit each space manually.
          </Alert>
        ) : null}
      </div>
    </Popup>
  );
}

function StatusEditor({
  state,
  isSystem,
  canWrite,
  busy,
  onChange,
  onSave,
  onCancel
}: {
  state: DraftState;
  isSystem: boolean;
  canWrite: boolean;
  busy: boolean;
  onChange: React.Dispatch<React.SetStateAction<DraftState | null>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  function setField<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    onChange((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Chip color={state.color} label={state.label || "Preview"} status={true} />
        <Button iconOnly aria-label="Cancel edit" onClick={onCancel}>
          <X />
        </Button>
      </div>
      <FormField label="Label">
        <Input disabled={!canWrite || busy} maxLength={40} onChange={(event) => setField("label", event.target.value)} value={state.label} />
      </FormField>
      <FormField hint={isSystem ? "Locked for system statuses" : "Drives bookability behavior"} label="Behaves as">
        <Select
          disabled={!canWrite || busy || isSystem}
          onChange={(event) => setField("behavesAs", event.target.value as FacilitySpaceStatus)}
          options={BEHAVES_AS_OPTIONS}
          value={state.behavesAs}
        />
      </FormField>
      <FormField label="Color">
        <div className="flex flex-wrap gap-2">
          {STATUS_COLORS.map((color) => {
            const selected = color.slug === state.color;
            return (
              <button
                aria-label={color.label}
                aria-pressed={selected}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition",
                  color.swatch,
                  selected ? "border-text ring-2 ring-ring ring-offset-2 ring-offset-canvas" : "border-transparent hover:border-border"
                )}
                disabled={!canWrite || busy}
                key={color.slug}
                onClick={() => setField("color", color.slug)}
                title={color.label}
                type="button"
              />
            );
          })}
        </div>
      </FormField>
      <div className="flex justify-end gap-2 pt-1">
        <Button disabled={busy} onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button disabled={!canWrite || busy} loading={busy} onClick={onSave} variant="primary">
          {state.mode === "create" ? "Add status" : "Save"}
        </Button>
      </div>
    </div>
  );
}
