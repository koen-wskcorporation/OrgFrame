"use client";

import * as React from "react";
import { CreateWizard } from "@orgframe/ui/primitives/create-wizard";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { saveProgramHierarchyAction } from "@/src/features/programs/actions";
import type { ProgramMapNode } from "@/src/features/programs/map/types";

type CreateTeamWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  divisions: ProgramMapNode[];
  defaultParentId: string | null;
  existingSlugs: Set<string>;
  onCreated: () => void;
};

type State = {
  parentId: string;
  name: string;
  slug: string;
  slugTouched: boolean;
  capacity: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(base: string, taken: Set<string>) {
  const root = slugify(base) || "team";
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function CreateTeamWizard({
  open,
  onClose,
  orgSlug,
  programId,
  divisions,
  defaultParentId,
  existingSlugs,
  onCreated
}: CreateTeamWizardProps) {
  const toast = useToast();

  const initialState = React.useMemo<State>(
    () => ({
      parentId: defaultParentId ?? divisions[0]?.id ?? "",
      name: "",
      slug: "",
      slugTouched: false,
      capacity: ""
    }),
    // re-init each time we open
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, defaultParentId, divisions.map((d) => d.id).join("|")]
  );

  const divisionOptions = divisions.map((division) => ({ value: division.id, label: division.name }));

  return (
    <CreateWizard<State>
      open={open}
      onClose={onClose}
      title="Add team"
      submitLabel="Create team"
      initialState={initialState}
      steps={[
        {
          id: "details",
          label: "Details",
          validate: (state) => {
            const errors: Record<string, string> = {};
            if (!state.parentId) errors.parentId = "Pick a division.";
            if (!state.name.trim()) errors.name = "Name is required.";
            const finalSlug = state.slugTouched ? slugify(state.slug) : uniqueSlug(state.name, existingSlugs);
            if (!finalSlug) errors.slug = "Slug is required.";
            else if (state.slugTouched && existingSlugs.has(finalSlug)) errors.slug = "That slug is already used.";
            if (state.capacity.trim() !== "") {
              const num = Number(state.capacity);
              if (!Number.isFinite(num) || num < 0) errors.capacity = "Capacity must be a non-negative number.";
            }
            return Object.keys(errors).length ? errors : null;
          },
          render: ({ state, setState, fieldErrors }) => (
            <div className="flex flex-col gap-3">
              <FormField label="Division" error={fieldErrors.parentId}>
                <Select
                  options={divisionOptions}
                  value={state.parentId}
                  onChange={(event) => setState((current) => ({ ...current, parentId: event.target.value }))}
                  placeholder={divisions.length ? "Pick a division" : "Add a division first"}
                  disabled={divisions.length === 0}
                />
              </FormField>
              <FormField label="Name" error={fieldErrors.name}>
                <Input
                  autoFocus
                  value={state.name}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      name: event.target.value,
                      slug: current.slugTouched ? current.slug : slugify(event.target.value)
                    }))
                  }
                />
              </FormField>
              <FormField label="Slug" error={fieldErrors.slug}>
                <Input
                  value={state.slug}
                  onChange={(event) =>
                    setState((current) => ({ ...current, slug: event.target.value, slugTouched: true }))
                  }
                />
              </FormField>
              <FormField label="Capacity" hint="Optional. Max number of players." error={fieldErrors.capacity}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={state.capacity}
                  onChange={(event) => setState((current) => ({ ...current, capacity: event.target.value }))}
                />
              </FormField>
            </div>
          )
        }
      ]}
      onSubmit={async (state) => {
        const slug = state.slugTouched ? slugify(state.slug) : uniqueSlug(state.name, existingSlugs);
        const capacity = state.capacity.trim() === "" ? null : Number(state.capacity);
        const result = await saveProgramHierarchyAction({
          orgSlug,
          programId,
          action: "create",
          name: state.name.trim(),
          slug,
          nodeKind: "team",
          parentId: state.parentId,
          capacity: typeof capacity === "number" && Number.isFinite(capacity) ? capacity : null,
          waitlistEnabled: false
        });
        if (!result.ok) {
          toast.toast({ title: "Couldn't create team", description: result.error, variant: "destructive" });
          return { ok: false, message: result.error };
        }
        toast.toast({ title: "Team created" });
        onCreated();
        return { ok: true };
      }}
    />
  );
}
