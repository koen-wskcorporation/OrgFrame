"use client";

import * as React from "react";
import { CreateWizard } from "@orgframe/ui/primitives/create-wizard";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { useToast } from "@orgframe/ui/primitives/toast";
import { saveProgramHierarchyAction } from "@/src/features/programs/actions";

type CreateDivisionWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  existingSlugs: Set<string>;
  onCreated: () => void;
};

type State = { name: string; slug: string; slugTouched: boolean };

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(base: string, taken: Set<string>) {
  const root = slugify(base) || "division";
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function CreateDivisionWizard({
  open,
  onClose,
  orgSlug,
  programId,
  existingSlugs,
  onCreated
}: CreateDivisionWizardProps) {
  const toast = useToast();
  const initialState: State = React.useMemo(
    () => ({ name: "", slug: "", slugTouched: false }),
    // re-key on open so the wizard resets between launches
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  return (
    <CreateWizard<State>
      open={open}
      onClose={onClose}
      title="Add division"
      submitLabel="Create division"
      initialState={initialState}
      steps={[
        {
          id: "details",
          label: "Details",
          validate: (state) => {
            const errors: Record<string, string> = {};
            if (!state.name.trim()) errors.name = "Name is required.";
            const finalSlug = state.slugTouched ? slugify(state.slug) : uniqueSlug(state.name, existingSlugs);
            if (!finalSlug) errors.slug = "Slug is required.";
            else if (state.slugTouched && existingSlugs.has(finalSlug)) errors.slug = "That slug is already used.";
            return Object.keys(errors).length ? errors : null;
          },
          render: ({ state, setState, fieldErrors }) => (
            <div className="flex flex-col gap-3">
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
            </div>
          )
        }
      ]}
      onSubmit={async (state) => {
        const slug = state.slugTouched ? slugify(state.slug) : uniqueSlug(state.name, existingSlugs);
        const result = await saveProgramHierarchyAction({
          orgSlug,
          programId,
          action: "create",
          name: state.name.trim(),
          slug,
          nodeKind: "division",
          parentId: null,
          capacity: null,
          waitlistEnabled: false
        });
        if (!result.ok) {
          toast.toast({ title: "Couldn't create division", description: result.error, variant: "destructive" });
          return { ok: false, message: result.error };
        }
        toast.toast({ title: "Division created" });
        onCreated();
        return { ok: true };
      }}
    />
  );
}
