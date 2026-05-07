"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { CreateWizard } from "@orgframe/ui/primitives/create-wizard";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { useToast } from "@orgframe/ui/primitives/toast";
import { saveProgramHierarchyAction } from "@/src/features/programs/actions";
import type { ProgramMapNode } from "@/src/features/programs/map/types";

type EditNodeWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  node: ProgramMapNode;
  canWrite: boolean;
  onMutated: () => void;
};

type State = {
  name: string;
  slug: string;
  capacity: string;
};

export function EditNodeWizard({ open, onClose, orgSlug, programId, node, canWrite, onMutated }: EditNodeWizardProps) {
  const toast = useToast();
  const { confirm } = useConfirmDialog();
  const [deleting, setDeleting] = React.useState(false);

  const initialState = React.useMemo<State>(
    () => ({
      name: node.name,
      slug: node.slug,
      capacity: node.capacity == null ? "" : String(node.capacity)
    }),
    [node.id, node.name, node.slug, node.capacity]
  );

  const handleDelete = async () => {
    if (!canWrite) return;
    const ok = await confirm({
      title: `Delete ${node.nodeKind} "${node.name}"?`,
      description: "This cannot be undone. Children of this node will also be removed.",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      variant: "destructive"
    });
    if (!ok) return;
    setDeleting(true);
    const result = await saveProgramHierarchyAction({
      orgSlug,
      programId,
      action: "delete",
      nodeId: node.id
    });
    setDeleting(false);
    if (!result.ok) {
      toast.toast({ title: "Couldn't delete", description: result.error, variant: "destructive" });
      return;
    }
    toast.toast({ title: "Deleted" });
    onMutated();
    onClose();
  };

  return (
    <CreateWizard<State>
      open={open}
      onClose={onClose}
      mode="edit"
      title={`${node.nodeKind === "division" ? "Division" : "Team"} settings`}
      subtitle={node.name}
      submitLabel="Save"
      initialState={initialState}
      steps={[
        {
          id: "details",
          label: "Details",
          validate: (state) => {
            const errors: Record<string, string> = {};
            if (!state.name.trim()) errors.name = "Name is required.";
            if (!state.slug.trim()) errors.slug = "Slug is required.";
            if (state.capacity.trim() !== "") {
              const num = Number(state.capacity);
              if (!Number.isFinite(num) || num < 0) errors.capacity = "Capacity must be a non-negative number.";
            }
            return Object.keys(errors).length ? errors : null;
          },
          render: ({ state, setField, fieldErrors }) => (
            <div className="flex flex-col gap-3">
              <FormField label="Name" error={fieldErrors.name}>
                <Input
                  value={state.name}
                  disabled={!canWrite}
                  onChange={(event) => setField("name", event.target.value)}
                />
              </FormField>
              <FormField label="Slug" error={fieldErrors.slug}>
                <Input
                  value={state.slug}
                  disabled={!canWrite}
                  onChange={(event) => setField("slug", event.target.value)}
                />
              </FormField>
              <FormField label="Capacity" hint="Optional. Max number of players." error={fieldErrors.capacity}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={state.capacity}
                  disabled={!canWrite}
                  onChange={(event) => setField("capacity", event.target.value)}
                />
              </FormField>
              {canWrite ? (
                <div className="mt-2 border-t border-border pt-3">
                  <Button variant="ghost" onClick={handleDelete} disabled={deleting}>
                    <Trash2 />
                    Delete {node.nodeKind}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        }
      ]}
      onSubmit={async (state) => {
        if (!canWrite) return { ok: false, message: "Read-only access." };
        const capacity = state.capacity.trim() === "" ? null : Number(state.capacity);
        const result = await saveProgramHierarchyAction({
          orgSlug,
          programId,
          action: "update",
          nodeId: node.id,
          name: state.name.trim(),
          slug: state.slug.trim(),
          nodeKind: node.nodeKind,
          capacity: typeof capacity === "number" && Number.isFinite(capacity) ? capacity : null,
          waitlistEnabled: false
        });
        if (!result.ok) {
          toast.toast({ title: "Couldn't save", description: result.error, variant: "destructive" });
          return { ok: false, message: result.error };
        }
        toast.toast({ title: "Saved" });
        onMutated();
        return { ok: true };
      }}
    />
  );
}
