"use client";

import * as React from "react";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import { useToast } from "@orgframe/ui/primitives/toast";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import { saveProgramHierarchyAction } from "@/src/features/programs/actions";
import { computeSlugStatus } from "@/src/features/programs/map/slug-utils";
import type { ProgramMapNode } from "@/src/features/programs/map/types";
import type { ProgramNode } from "@/src/features/programs/types";

type Kind = "division" | "team";

type CreateState = {
  kind: Kind | null;
  parentId: string;
  name: string;
  slug: string;
  capacity: string;
};

type CreateNodeWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  /** Public-URL slug of the program — used to render the team slug's
   *  inline path prefix (e.g. "/programs/spring-2026/"). */
  programSlug: string;
  divisions: ProgramMapNode[];
  /** Pre-fills the team's parent picker. Used when the user had a division
   *  selected at the moment they clicked Add. */
  defaultParentId: string | null;
  /** Pre-selects the kind and hides the "Type" step. Used by the in-canvas
   *  "Add team" affordance inside a division card. */
  defaultKind?: Kind | null;
  existingSlugs: Set<string>;
  onCreated: (nextNodes: ProgramNode[]) => void;
};

/**
 * Sidebar wizard for adding a division or team to the program map. Steps:
 *
 *   1. Type        — Division or Team (skipped when `defaultKind` is set)
 *   2. Division    — pick the parent division (team only)
 *   3. Identity    — name + slug
 *   4. Capacity    — optional roster cap (team only)
 */
export function CreateNodeWizard({
  open,
  onClose,
  orgSlug,
  programId,
  programSlug,
  divisions,
  defaultParentId,
  defaultKind = null,
  existingSlugs,
  onCreated
}: CreateNodeWizardProps) {
  const { toast } = useToast();

  const initialState = React.useMemo<CreateState>(
    () => ({
      kind: defaultKind ?? null,
      parentId: defaultParentId ?? divisions[0]?.id ?? "",
      name: "",
      slug: "",
      capacity: ""
    }),
    [defaultKind, defaultParentId, divisions]
  );

  const steps: WizardStep<CreateState>[] = [
    {
      id: "type",
      label: "Type",
      description: "What are you adding to the program map?",
      skipWhen: () => defaultKind !== null,
      validate: (state) => (state.kind ? null : { kind: "Pick a type." }),
      render: ({ state, setField, fieldErrors }) => (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pick what to add">
          <SelectionBox
            description="A top-level group that contains teams."
            label="Division"
            onSelectedChange={() => setField("kind", "division")}
            selected={state.kind === "division"}
          />
          <SelectionBox
            description={
              divisions.length === 0 ? "Add a division first." : "A team lives inside a division."
            }
            disabled={divisions.length === 0}
            label="Team"
            onSelectedChange={() => setField("kind", "team")}
            selected={state.kind === "team"}
          />
          {fieldErrors.kind ? (
            <p className="text-xs text-destructive">{fieldErrors.kind}</p>
          ) : null}
        </div>
      )
    },
    {
      id: "parent",
      label: "Division",
      description: "Which division will this team belong to?",
      skipWhen: (state) => state.kind !== "team",
      validate: (state) =>
        state.kind === "team" && !state.parentId ? { parentId: "Pick a division." } : null,
      render: ({ state, setField, fieldErrors }) => (
        <FormField error={fieldErrors.parentId} label="Division">
          <Select
            disabled={divisions.length === 0}
            onChange={(event) => setField("parentId", event.target.value)}
            options={divisions.map((division) => ({ value: division.id, label: division.name }))}
            placeholder={divisions.length ? "Pick a division" : "Add a division first"}
            value={state.parentId}
          />
        </FormField>
      )
    },
    {
      id: "identity",
      label: "Identity",
      description: "Name your division or team. The slug shows up in URLs and must be unique within the program.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (!state.name.trim()) errors.name = "Name is required.";
        const finalSlug = state.slug.trim();
        if (!finalSlug) {
          errors.slug = "Slug is required.";
        } else if (computeSlugStatus(finalSlug, existingSlugs) !== "available") {
          errors.slug = existingSlugs.has(finalSlug)
            ? "That slug is already used."
            : "Use 2-80 lowercase letters, numbers, and hyphens.";
        }
        return Object.keys(errors).length ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => {
        // For team nodes, nest the slug under the chosen division so the
        // inline path prefix renders /programs/<programSlug>/<divisionSlug>/.
        const divisionSlug =
          state.kind === "team"
            ? divisions.find((division) => division.id === state.parentId)?.slug
            : undefined;
        return (
          <div className="flex flex-col gap-3">
            <FormField error={fieldErrors.name} label="Name">
              <Input
                autoFocus
                onChange={(event) => setField("name", event.target.value)}
                placeholder={state.kind === "division" ? "U10 Boys, Spring League, …" : "Sharks, Lightning, …"}
                value={state.name}
              />
            </FormField>
            <FormField error={fieldErrors.slug} label="Slug">
              <Input
                onChange={(event) => setField("slug", event.target.value)}
                onSlugAutoChange={(value) => setField("slug", value)}
                slugAutoEnabled
                slugAutoSource={state.name}
                slugValidation={{
                  kind: "program-node",
                  orgSlug,
                  programSlug,
                  divisionSlug,
                  existingSlugs
                }}
                value={state.slug}
              />
            </FormField>
          </div>
        );
      }
    },
    {
      id: "capacity",
      label: "Capacity",
      description: "Optional — cap how many players can be on this team.",
      skipWhen: (state) => state.kind !== "team",
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
            inputMode="numeric"
            min={0}
            onChange={(event) => setField("capacity", event.target.value)}
            placeholder="e.g. 12"
            type="number"
            value={state.capacity}
          />
        </FormField>
      )
    }
  ];

  async function handleSubmit(state: CreateState): Promise<CreateWizardSubmitResult> {
    if (!state.kind) {
      return { ok: false, message: "Pick a type.", stepId: "type" };
    }
    const finalSlug = state.slug.trim();
    const cap = state.capacity.trim() === "" ? null : Number(state.capacity);
    const result = await saveProgramHierarchyAction({
      orgSlug,
      programId,
      action: "create",
      name: state.name.trim(),
      slug: finalSlug,
      nodeKind: state.kind,
      parentId: state.kind === "team" ? state.parentId : null,
      capacity:
        state.kind === "team" && typeof cap === "number" && Number.isFinite(cap) ? cap : null,
      waitlistEnabled: false
    });
    if (!result.ok) {
      toast({
        title: state.kind === "division" ? "Couldn't create division" : "Couldn't create team",
        description: result.error,
        variant: "destructive"
      });
      return { ok: false, message: result.error };
    }
    toast({ title: state.kind === "division" ? "Division created" : "Team created", variant: "success" });
    onCreated(result.data.details.nodes);
    return { ok: true };
  }

  return (
    <CreateWizard<CreateState>
      hideCancel
      initialState={initialState}
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Create"
      subtitle="Add a division or team to the program structure."
      title="Add to map"
    />
  );
}
