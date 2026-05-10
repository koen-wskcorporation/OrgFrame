"use client";

import * as React from "react";
import { ChevronLeft, Save } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import { useToast } from "@orgframe/ui/primitives/toast";
import { saveProgramHierarchyAction } from "@/src/features/programs/actions";
import { computeSlugStatus, SlugField, slugify } from "@/src/features/programs/map/components/SlugField";
import type { ProgramMapNode } from "@/src/features/programs/map/types";
import type { ProgramNode } from "@/src/features/programs/types";

type Kind = "division" | "team";
type Step = "type" | "details";

type CreateNodeWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  divisions: ProgramMapNode[];
  /** Pre-fills the team's parent picker. Used when the user had a division
   *  selected at the moment they clicked Add. */
  defaultParentId: string | null;
  /** Pre-selects the kind and skips straight to the details step. Used by
   *  the in-canvas "Add team" dashed slot inside a division. */
  defaultKind?: Kind | null;
  existingSlugs: Set<string>;
  onCreated: (nextNodes: ProgramNode[]) => void;
};

/**
 * Two-step "Add to map" wizard:
 *
 *   1. Pick the kind — Division or Team.
 *   2. Fill the kind-specific details (name + slug for divisions; parent +
 *      name + slug + capacity for teams).
 *
 * Replaces the previous separate `CreateDivisionWizard` / `CreateTeamWizard`
 * panels and the picker-menu Add button — there's now a single Add affordance
 * on the canvas action bar that opens this wizard.
 */
export function CreateNodeWizard({
  open,
  onClose,
  orgSlug,
  programId,
  divisions,
  defaultParentId,
  defaultKind = null,
  existingSlugs,
  onCreated
}: CreateNodeWizardProps) {
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const [step, setStep] = React.useState<Step>("type");
  const [kind, setKind] = React.useState<Kind | null>(null);
  const [parentId, setParentId] = React.useState<string>("");
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [capacity, setCapacity] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    parentId?: string;
    name?: string;
    slug?: string;
    capacity?: string;
  }>({});

  // Reset on each open so a previous draft doesn't leak across launches.
  React.useEffect(() => {
    if (!open) return;
    // When the caller pre-selected a kind (e.g. "Add team" slot inside a
    // division card), skip the type-picker step entirely.
    setStep(defaultKind ? "details" : "type");
    setKind(defaultKind);
    setParentId(defaultParentId ?? divisions[0]?.id ?? "");
    setName("");
    setSlug("");
    setSlugTouched(false);
    setCapacity("");
    setSubmitting(false);
    setErrors({});
    // re-init each time we open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultParentId]);

  const isDirty =
    step !== "type" ||
    kind !== null ||
    name.trim().length > 0 ||
    slugTouched ||
    capacity.trim().length > 0;

  const validateDetails = () => {
    const next: typeof errors = {};
    if (kind === "team" && !parentId) next.parentId = "Pick a division.";
    if (!name.trim()) next.name = "Name is required.";
    const finalSlug = slug.trim();
    if (!finalSlug) next.slug = "Slug is required.";
    else if (computeSlugStatus(finalSlug, existingSlugs) !== "available") {
      next.slug = existingSlugs.has(finalSlug)
        ? "That slug is already used."
        : "Use 2-80 lowercase letters, numbers, and hyphens.";
    }
    if (kind === "team" && capacity.trim() !== "") {
      const num = Number(capacity);
      if (!Number.isFinite(num) || num < 0) next.capacity = "Capacity must be a non-negative number.";
    }
    return Object.keys(next).length === 0 ? null : next;
  };

  const handleNext = () => {
    if (!kind) return;
    setStep("details");
  };

  const handleBack = () => {
    setStep("type");
    setErrors({});
  };

  const handleSubmit = async () => {
    if (!kind) return;
    const issues = validateDetails();
    if (issues) {
      setErrors(issues);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const finalSlug = slugTouched ? slugify(slug) : slug;
    const cap = capacity.trim() === "" ? null : Number(capacity);
    const result = await saveProgramHierarchyAction({
      orgSlug,
      programId,
      action: "create",
      name: name.trim(),
      slug: finalSlug,
      nodeKind: kind,
      parentId: kind === "team" ? parentId : null,
      capacity: kind === "team" && typeof cap === "number" && Number.isFinite(cap) ? cap : null,
      waitlistEnabled: false
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.toast({
        title: kind === "division" ? "Couldn't create division" : "Couldn't create team",
        description: result.error,
        variant: "destructive"
      });
      return;
    }
    toast.toast({ title: kind === "division" ? "Division created" : "Team created" });
    onCreated(result.data.details.nodes);
    onClose();
  };

  const requestClose = async () => {
    if (!isDirty || submitting) {
      onClose();
      return;
    }
    const ok = await confirm({
      title: "Discard?",
      description: "Your unsaved details will be lost.",
      confirmLabel: "Discard",
      variant: "destructive"
    });
    if (ok) onClose();
  };

  const subtitle =
    step === "type"
      ? "What are you adding?"
      : kind === "division"
        ? "Top-level group that contains teams."
        : "A team lives inside a division.";

  // When the caller hard-selected a kind, the Back button has nowhere to
  // return to — swap it for Cancel.
  const lockedToKind = defaultKind !== null;

  const footer =
    step === "type" ? (
      <>
        <Button intent="cancel" disabled={submitting} onClick={requestClose} type="button" variant="ghost">Cancel</Button>
        <Button className="ml-auto" disabled={!kind} onClick={handleNext} type="button">
          Next
        </Button>
      </>
    ) : (
      <>
        {lockedToKind ? (
          <Button intent="cancel" disabled={submitting} onClick={requestClose} type="button" variant="ghost">Cancel</Button>
        ) : (
          <Button disabled={submitting} onClick={handleBack} type="button" variant="ghost">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        )}
        <Button
          className="ml-auto"
          disabled={submitting}
          loading={submitting}
          onClick={handleSubmit}
          type="submit"
        >
          <Save className="h-4 w-4" />
          Create {kind}
        </Button>
      </>
    );

  const divisionOptions = divisions.map((division) => ({ value: division.id, label: division.name }));

  return (
    <Panel
      footer={footer}
      onClose={requestClose}
      open={open}
      panelKey="program-map-create-node"
      subtitle={subtitle}
      title="Add to map"
    >
      {step === "type" ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pick what to add">
          <SelectionBox
            description="Top-level group that contains teams."
            label="Division"
            onSelectedChange={() => setKind("division")}
            selected={kind === "division"}
          />
          <SelectionBox
            description={
              divisions.length === 0 ? "Add a division first." : "A roster lives inside a division."
            }
            disabled={divisions.length === 0}
            label="Team"
            onSelectedChange={() => setKind("team")}
            selected={kind === "team"}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {kind === "team" ? (
            <FormField error={errors.parentId} label="Division">
              <Select
                disabled={divisions.length === 0}
                onChange={(event) => setParentId(event.target.value)}
                options={divisionOptions}
                placeholder={divisions.length ? "Pick a division" : "Add a division first"}
                value={parentId}
              />
            </FormField>
          ) : null}
          <FormField error={errors.name} label="Name">
            <Input
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "division" ? "U10 Boys, Spring League, …" : "Sharks, Lightning, …"}
              value={name}
            />
          </FormField>
          <SlugField
            error={errors.slug}
            existingSlugs={existingSlugs}
            fallbackBase={kind ?? "item"}
            kindLabel={kind === "division" ? "division name" : "team name"}
            nameSource={name}
            onChange={setSlug}
            onTouchedChange={setSlugTouched}
            touched={slugTouched}
            value={slug}
          />
          {kind === "team" ? (
            <FormField error={errors.capacity} hint="Optional. Max number of players." label="Capacity">
              <Input
                inputMode="numeric"
                min={0}
                onChange={(event) => setCapacity(event.target.value)}
                type="number"
                value={capacity}
              />
            </FormField>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

