"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { useToast } from "@orgframe/ui/primitives/toast";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import { saveProgramHierarchyAction } from "@/src/features/programs/actions";
import { computeSlugStatus } from "@/src/features/programs/map/slug-utils";
import type { ProgramMapNode } from "@/src/features/programs/map/types";

type EditNodeWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  /** Public-URL slug of the program — used to render the team slug's
   *  inline path prefix (e.g. "/programs/spring-2026/"). */
  programSlug: string;
  node: ProgramMapNode;
  /** Slug of the team's parent division. Used to nest the inline path
   *  prefix as /programs/<programSlug>/<divisionSlug>/. Null for divisions
   *  (which sit directly under /programs/<programSlug>/). */
  parentDivisionSlug: string | null;
  canWrite: boolean;
  /** All program slugs in use, minus the current node's slug — drives the
   *  uniqueness checker on the Identity step. */
  existingSlugs: Set<string>;
  onMutated: () => void;
};

type EditState = {
  name: string;
  slug: string;
  capacity: string;
};

/**
 * Edit panel for a division or team. Multi-step so each concern owns its
 * step and the user can jump freely between them.
 *
 *   Division: Identity → Danger zone
 *   Team:     Identity → Roster → Danger zone
 */
export function EditNodeWizard({
  open,
  onClose,
  orgSlug,
  programId,
  programSlug,
  node,
  parentDivisionSlug,
  canWrite,
  existingSlugs,
  onMutated
}: EditNodeWizardProps) {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [deleting, setDeleting] = React.useState(false);

  // Editing this node's own slug shouldn't trip "already used" — drop it
  // from the conflict set before passing to the validator.
  const slugConflicts = React.useMemo(() => {
    const next = new Set(existingSlugs);
    next.delete(node.slug);
    return next;
  }, [existingSlugs, node.slug]);

  const initialState = React.useMemo<EditState>(
    () => ({
      name: node.name,
      slug: node.slug,
      capacity: node.capacity == null ? "" : String(node.capacity)
    }),
    [node.id, node.name, node.slug, node.capacity]
  );

  const handleDelete = React.useCallback(async () => {
    if (!canWrite) return;
    const ok = await confirm({
      title: `Delete ${node.nodeKind} "${node.name}"?`,
      description:
        node.nodeKind === "division"
          ? "This cannot be undone. Any teams inside this division will also be removed."
          : "This cannot be undone.",
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
      toast({ title: "Couldn't delete", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: `${node.nodeKind === "division" ? "Division" : "Team"} deleted`, variant: "success" });
    onMutated();
    onClose();
  }, [canWrite, confirm, node.id, node.name, node.nodeKind, onClose, onMutated, orgSlug, programId, toast]);

  const steps: WizardStep<EditState>[] = [
    {
      id: "identity",
      label: "Identity",
      description: "Update the display name and slug.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (!state.name.trim()) errors.name = "Name is required.";
        const slug = state.slug.trim();
        if (!slug) {
          errors.slug = "Slug is required.";
        } else if (computeSlugStatus(slug, slugConflicts) !== "available") {
          errors.slug = slugConflicts.has(slug)
            ? "That slug is already used."
            : "Use 2-80 lowercase letters, numbers, and hyphens.";
        }
        return Object.keys(errors).length ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="flex flex-col gap-3">
          <FormField error={fieldErrors.name} label="Name">
            <Input
              disabled={!canWrite}
              onChange={(event) => setField("name", event.target.value)}
              value={state.name}
            />
          </FormField>
          <FormField error={fieldErrors.slug} label="Slug">
            <Input
              disabled={!canWrite}
              onChange={(event) => setField("slug", event.target.value)}
              slugValidation={{
                kind: "program-node",
                orgSlug,
                programSlug,
                divisionSlug: parentDivisionSlug ?? undefined,
                existingSlugs: slugConflicts,
                currentSlug: node.slug
              }}
              value={state.slug}
            />
          </FormField>
        </div>
      )
    },
    {
      id: "roster",
      label: "Roster",
      description: "Configure the team's roster.",
      skipWhen: () => node.nodeKind !== "team",
      validate: (state) => {
        if (state.capacity.trim() === "") return null;
        const num = Number(state.capacity);
        return Number.isFinite(num) && num >= 0
          ? null
          : { capacity: "Capacity must be a non-negative number." };
      },
      render: ({ state, setField, fieldErrors }) => (
        <FormField error={fieldErrors.capacity} hint="Leave blank for no cap." label="Roster capacity">
          <Input
            disabled={!canWrite}
            inputMode="numeric"
            min={0}
            onChange={(event) => setField("capacity", event.target.value)}
            placeholder="e.g. 12"
            type="number"
            value={state.capacity}
          />
        </FormField>
      )
    },
    {
      id: "danger",
      label: "Danger zone",
      description:
        node.nodeKind === "division"
          ? "Permanently remove this division and the teams inside it."
          : "Permanently remove this team and its roster.",
      skipWhen: () => !canWrite,
      render: () => (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            {node.nodeKind === "division"
              ? "Deleting a division also removes every team inside it. This can't be undone."
              : "Deleting a team also removes its players and staff assignments. This can't be undone."}
          </p>
          <div>
            <Button disabled={deleting} intent="delete" loading={deleting} onClick={handleDelete}>
              Delete {node.nodeKind}
            </Button>
          </div>
        </div>
      )
    }
  ];

  async function handleSubmit(state: EditState): Promise<CreateWizardSubmitResult> {
    if (!canWrite) {
      return { ok: false, message: "Read-only access." };
    }
    const capacity = state.capacity.trim() === "" ? null : Number(state.capacity);
    const result = await saveProgramHierarchyAction({
      orgSlug,
      programId,
      action: "update",
      nodeId: node.id,
      name: state.name.trim(),
      slug: state.slug.trim(),
      nodeKind: node.nodeKind,
      capacity:
        node.nodeKind === "team" && typeof capacity === "number" && Number.isFinite(capacity)
          ? capacity
          : null,
      waitlistEnabled: false
    });
    if (!result.ok) {
      toast({ title: "Couldn't save", description: result.error, variant: "destructive" });
      return { ok: false, message: result.error, stepId: "identity" };
    }
    toast({ title: "Saved", variant: "success" });
    onMutated();
    return { ok: true };
  }

  return (
    <CreateWizard<EditState>
      hideCancel
      initialState={initialState}
      mode="edit"
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Save changes"
      subtitle={node.name}
      title={node.nodeKind === "division" ? "Division settings" : "Team settings"}
      submitLabel="Save"
      initialState={initialState}
      footerLeading={
        canWrite ? (
          <Button
            aria-label={`Delete ${node.nodeKind}`}
            disabled={deleting}
            iconOnly
            loading={deleting}
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null
      }
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
