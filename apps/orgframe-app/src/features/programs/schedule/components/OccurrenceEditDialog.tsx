"use client";

import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Check, X } from "lucide-react";
import type { ProgramNode } from "@/src/features/programs/types";
import type { OccurrenceEditDraft } from "@/src/features/programs/schedule/components/types";

type OccurrenceEditDialogProps = {
  open: boolean;
  draft: OccurrenceEditDraft | null;
  nodes: ProgramNode[];
  canWrite: boolean;
  isSaving: boolean;
  onClose: () => void;
  onChange: (next: OccurrenceEditDraft) => void;
  onSave: () => void;
};

export function OccurrenceEditDialog({
  open,
  draft,
  nodes: _nodes,
  canWrite,
  isSaving,
  onClose,
  onChange,
  onSave
}: OccurrenceEditDialogProps) {
  return (
    <Popup
      footer={
        <Button
          disabled={!canWrite || !draft || !draft.localDate || !draft.timezone}
          loading={isSaving}
          onClick={onSave}
          type="button"
          variant="secondary"
        >
          <Check className="h-4 w-4" />
          Save Occurrence
        </Button>
      }
      onClose={onClose}
      open={open}
      size="sm"
      subtitle="Change this one session without rebuilding the entire schedule."
      title={draft?.occurrenceId ? "Edit occurrence" : "Add occurrence"}
    >
      {draft ? (
        <form className="grid gap-3" onSubmit={(event) => event.preventDefault()}>
          <FormField hint="Optional" label="Title">
            <Input disabled={!canWrite} onChange={(event) => onChange({ ...draft, title: event.target.value })} value={draft.title} />
          </FormField>
          <FormField label="Date">
            <Input disabled={!canWrite} onChange={(event) => onChange({ ...draft, localDate: event.target.value })} type="date" value={draft.localDate} />
          </FormField>
          <FormField label="Start time">
            <Input disabled={!canWrite} onChange={(event) => onChange({ ...draft, localStartTime: event.target.value })} type="time" value={draft.localStartTime} />
          </FormField>
          <FormField label="End time">
            <Input disabled={!canWrite} onChange={(event) => onChange({ ...draft, localEndTime: event.target.value })} type="time" value={draft.localEndTime} />
          </FormField>
        </form>
      ) : null}
    </Popup>
  );
}
