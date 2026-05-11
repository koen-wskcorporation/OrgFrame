"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { useToast } from "@orgframe/ui/primitives/toast";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import { createFormAction } from "@/src/features/forms/actions";
import { setProgramExternalRegistrationAction } from "@/src/features/programs/actions";

type RegistrationSource = "internal" | "external";

type WizardState = {
  source: RegistrationSource;
  name: string;
  slug: string;
  description: string;
  externalUrl: string;
  externalLabel: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_PATTERN = /^https?:\/\/.+/i;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type RegistrationFormCreateWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programId: string;
  programName: string;
  programSlug: string;
  canWrite?: boolean;
};

export function RegistrationFormCreateWizard({
  open,
  onClose,
  orgSlug,
  programId,
  programName,
  programSlug,
  canWrite = true
}: RegistrationFormCreateWizardProps) {
  const router = useRouter();
  const { toast } = useToast();

  const initialState = React.useMemo<WizardState>(
    () => ({
      source: "internal",
      name: `${programName} Registration`,
      slug: `${programSlug}-registration`,
      description: "",
      externalUrl: "",
      externalLabel: ""
    }),
    [programName, programSlug]
  );

  const steps: WizardStep<WizardState>[] = [
    {
      id: "source",
      label: "Source",
      description: "Pick where players will register for this program.",
      render: ({ state, setField }) => (
        <div className="space-y-2" role="radiogroup">
          <SelectionBox
            description="Build the registration form here. Branded, integrated with players, payments, and program assignments."
            label="OrgFrame registration form"
            onSelectedChange={() => setField("source", "internal")}
            selected={state.source === "internal"}
          />
          <SelectionBox
            description="Link out to a registration form hosted elsewhere (Google Forms, JotForm, your old league site, etc.)."
            label="External link"
            onSelectedChange={() => setField("source", "external")}
            selected={state.source === "external"}
          />
        </div>
      )
    },
    {
      id: "internal",
      label: "Form details",
      description: "Set the form's name and URL. You'll edit fields and pages after creation.",
      skipWhen: (state) => state.source !== "internal",
      validate: (state) => {
        if (state.source !== "internal") return null;
        const errors: Record<string, string> = {};
        if (state.name.trim().length < 2) {
          errors.name = "Form name must be at least 2 characters.";
        }
        const slug = state.slug.trim() || slugify(state.name);
        if (!slug) {
          errors.slug = "A slug is required.";
        } else if (slug.length < 2 || slug.length > 80 || !SLUG_PATTERN.test(slug)) {
          errors.slug = "Use 2-80 lowercase letters, numbers, and hyphens.";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.name} label="Form name">
            <Input
              autoFocus
              disabled={!canWrite}
              onChange={(event) => setField("name", event.target.value)}
              placeholder={`${programName} Registration`}
              value={state.name}
            />
          </FormField>
          <FormField error={fieldErrors.slug} hint="Auto-generated from name if blank." label="Slug">
            <Input
              disabled={!canWrite}
              onChange={(event) => setField("slug", slugify(event.target.value))}
              onSlugAutoChange={(value) => setField("slug", value)}
              slugAutoEnabled
              slugAutoSource={state.name}
              slugValidation={{ kind: "form", orgSlug }}
              value={state.slug}
            />
          </FormField>
          <FormField hint="Shown on the public registration page." label="Description">
            <Textarea
              className="min-h-[80px]"
              disabled={!canWrite}
              onChange={(event) => setField("description", event.target.value)}
              value={state.description}
            />
          </FormField>
        </div>
      )
    },
    {
      id: "external",
      label: "Link",
      description: "Paste the URL of the form you want to link to.",
      skipWhen: (state) => state.source !== "external",
      validate: (state) => {
        if (state.source !== "external") return null;
        const errors: Record<string, string> = {};
        const url = state.externalUrl.trim();
        if (!url) {
          errors.externalUrl = "Enter a URL.";
        } else if (!URL_PATTERN.test(url)) {
          errors.externalUrl = "URL must start with http:// or https://";
        } else if (url.length > 2000) {
          errors.externalUrl = "URL is too long.";
        }
        if (state.externalLabel.length > 120) {
          errors.externalLabel = "Keep the label under 120 characters.";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.externalUrl} label="Registration URL">
            <Input
              autoFocus
              disabled={!canWrite}
              onChange={(event) => setField("externalUrl", event.target.value)}
              placeholder="https://example.com/register"
              value={state.externalUrl}
            />
          </FormField>
          <FormField
            error={fieldErrors.externalLabel}
            hint="Shown on the button that opens the external form. Defaults to “Register”."
            label="Button label (optional)"
          >
            <Input
              disabled={!canWrite}
              onChange={(event) => setField("externalLabel", event.target.value)}
              placeholder="Register"
              value={state.externalLabel}
            />
          </FormField>
        </div>
      )
    }
  ];

  async function handleSubmit(state: WizardState): Promise<CreateWizardSubmitResult> {
    if (state.source === "internal") {
      const slug = state.slug.trim() || slugify(state.name);
      const result = await createFormAction({
        orgSlug,
        slug,
        name: state.name.trim(),
        description: state.description.trim() || undefined,
        formKind: "program_registration",
        status: "draft",
        programId,
        targetMode: "choice",
        lockedProgramNodeId: null,
        allowMultiplePlayers: false,
        requireSignIn: true
      });
      if (!result.ok) {
        toast({ title: "Couldn't create form", description: result.error, variant: "destructive" });
        return { ok: false, message: result.error, stepId: "internal" };
      }
      toast({ title: "Registration form created", variant: "success" });
      onClose();
      router.push(`/manage/forms/${result.data.formId}/editor`);
      return { ok: true };
    }

    const result = await setProgramExternalRegistrationAction({
      orgSlug,
      programId,
      url: state.externalUrl.trim(),
      label: state.externalLabel.trim() || undefined
    });
    if (!result.ok) {
      toast({ title: "Couldn't save link", description: result.error, variant: "destructive" });
      return { ok: false, message: result.error, stepId: "external" };
    }
    toast({ title: "Registration link saved", variant: "success" });
    onClose();
    router.refresh();
    return { ok: true };
  }

  return (
    <CreateWizard
      hideCancel
      initialState={initialState}
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Create"
      subtitle="Connect a registration source for this program."
      title="Set up registration"
    />
  );
}

