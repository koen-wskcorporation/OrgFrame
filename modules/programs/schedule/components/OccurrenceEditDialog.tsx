"use client";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { ProgramNode } from "@/modules/programs/types";
import type { OccurrenceEditDraft } from "@/modules/programs/schedule/components/types";

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
    <Panel
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!canWrite || !draft || !draft.localDate || !draft.timezone}
            loading={isSaving}
            onClick={onSave}
            type="button"
            variant="secondary"
          >
            Save occurrence
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      panelClassName="ml-auto max-w-[300px]"
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
    </Panel>
  );
}
