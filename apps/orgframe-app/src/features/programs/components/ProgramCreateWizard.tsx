"use client";

import * as React from "react";
import { AssetTile } from "@orgframe/ui/primitives/asset-tile";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Chip } from "@orgframe/ui/primitives/chip";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";

export type ProgramCreateInput = {
  name: string;
  slug: string;
  programType: "league" | "season" | "clinic" | "custom";
  customTypeLabel: string;
  status: "draft" | "published" | "archived";
  description: string;
  coverImagePath: string;
  startDate: string;
  endDate: string;
};

type WizardState = ProgramCreateInput;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Header status-chip options. Matches the ProgramCreateInput["status"] union
// 1:1. Colours follow the convention from the website manager: emerald for
// the "live" state, slate for unpublished/inactive, rose for archived.
const PROGRAM_STATUS_OPTIONS = [
  { value: "published", label: "Published", color: "emerald" as const },
  { value: "draft", label: "Draft", color: "slate" as const },
  { value: "archived", label: "Archived", color: "rose" as const }
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildInitialState(): WizardState {
  return {
    name: "",
    slug: "",
    programType: "season",
    customTypeLabel: "",
    status: "draft",
    description: "",
    coverImagePath: "",
    startDate: "",
    endDate: ""
  };
}

type ProgramCreateWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  canWrite?: boolean;
  onSubmit: (input: ProgramCreateInput) => Promise<CreateWizardSubmitResult>;
  /** When provided, the wizard opens in edit mode pre-populated with this program. */
  existingProgram?: {
    id: string;
    name: string;
    slug: string;
    programType: ProgramCreateInput["programType"];
    customTypeLabel: string | null;
    status: ProgramCreateInput["status"];
    description: string | null;
    coverImagePath: string | null;
    startDate: string | null;
    endDate: string | null;
  };
};

export function ProgramCreateWizard({ open, onClose, orgSlug, canWrite = true, onSubmit, existingProgram }: ProgramCreateWizardProps) {
  const isEdit = Boolean(existingProgram);
  const initialState = React.useMemo<WizardState>(() => {
    if (existingProgram) {
      return {
        name: existingProgram.name,
        slug: existingProgram.slug,
        programType: existingProgram.programType,
        customTypeLabel: existingProgram.customTypeLabel ?? "",
        status: existingProgram.status,
        description: existingProgram.description ?? "",
        coverImagePath: existingProgram.coverImagePath ?? "",
        startDate: existingProgram.startDate ?? "",
        endDate: existingProgram.endDate ?? ""
      };
    }
    return buildInitialState();
  }, [existingProgram]);

  const steps: WizardStep<WizardState>[] = [
    {
      id: "identity",
      label: "Identity",
      description: "Name your program and pick a type. The slug is used in URLs and must be unique.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (state.name.trim().length < 2) {
          errors.name = "Program name must be at least 2 characters.";
        }
        const slug = state.slug.trim() || slugify(state.name);
        if (!slug) {
          errors.slug = "A slug is required.";
        } else if (slug.length < 2 || slug.length > 60 || !SLUG_PATTERN.test(slug)) {
          errors.slug = "Use 2-60 lowercase letters, numbers, and hyphens.";
        }
        if (state.programType === "custom" && state.customTypeLabel.trim().length === 0) {
          errors.customTypeLabel = "Add a label for your custom type.";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.name} label="Program name">
            <Input
              autoFocus
              disabled={!canWrite}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="e.g. Spring 2026 League"
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
              slugValidation={{
                kind: "program",
                orgSlug,
                currentSlug: existingProgram?.slug
              }}
              value={state.slug}
            />
          </FormField>
          <FormField label="Type">
            <Select
              disabled={!canWrite}
              onChange={(event) => setField("programType", event.target.value as WizardState["programType"])}
              options={[
                { value: "league", label: "League" },
                { value: "season", label: "Season" },
                { value: "clinic", label: "Clinic" },
                { value: "custom", label: "Custom" }
              ]}
              value={state.programType}
            />
          </FormField>
          {state.programType === "custom" ? (
            <FormField error={fieldErrors.customTypeLabel} label="Custom type label">
              <Input
                disabled={!canWrite}
                onChange={(event) => setField("customTypeLabel", event.target.value)}
                value={state.customTypeLabel}
              />
            </FormField>
          ) : null}
        </div>
      )
    },
    {
      id: "details",
      label: "Details",
      description: "Add a description and cover photo.",
      // Status moved to the header chip — see `headerTitleAccessory` below.
      render: ({ state, setField }) => (
        <div className="space-y-4">
          <FormField label="Description">
            <Textarea
              className="min-h-[90px]"
              disabled={!canWrite}
              onChange={(event) => setField("description", event.target.value)}
              value={state.description}
            />
          </FormField>
          <FormField label="Cover photo">
            <AssetTile
              constraints={{
                accept: "image/*,.svg",
                maxSizeMB: 10,
                aspect: "wide",
                recommendedPx: {
                  w: 1600,
                  h: 900
                }
              }}
              disabled={!canWrite}
              fit="cover"
              initialPath={state.coverImagePath || null}
              initialUrl={getOrgAssetPublicUrl(state.coverImagePath)}
              kind="org"
              onChange={(asset) => setField("coverImagePath", asset.path)}
              onRemove={() => setField("coverImagePath", "")}
              orgSlug={orgSlug}
              purpose="program-cover"
              specificationText="PNG, JPG, WEBP, HEIC, or SVG"
              title="Program cover"
            />
          </FormField>
        </div>
      )
    },
    {
      id: "schedule",
      label: "Schedule",
      description: "Optional. Set when the program runs.",
      validate: (state) => {
        if (state.startDate && state.endDate && state.endDate < state.startDate) {
          return { endDate: "End date must be after the start date." };
        }
        return null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Start date">
            <CalendarPicker disabled={!canWrite} onChange={(value) => setField("startDate", value)} value={state.startDate} />
          </FormField>
          <FormField error={fieldErrors.endDate} label="End date">
            <CalendarPicker disabled={!canWrite} onChange={(value) => setField("endDate", value)} value={state.endDate} />
          </FormField>
        </div>
      )
    }
  ];

  return (
    <CreateWizard
      draftId={isEdit ? undefined : `program-create.${orgSlug}`}
      headerTitleAccessory={({ state, setField }) => (
        <Chip
          status
          picker={{
            disabled: !canWrite,
            onChange: (value) => setField("status", value as WizardState["status"]),
            options: PROGRAM_STATUS_OPTIONS,
            value: state.status
          }}
        />
      )}
      hideCancel={isEdit}
      initialState={initialState}
      mode={isEdit ? "edit" : "create"}
      onClose={onClose}
      onSubmit={(state) => onSubmit({ ...state, slug: state.slug || slugify(state.name) })}
      open={open}
      steps={steps}
      submitLabel={isEdit ? "Save changes" : "Create program"}
      subtitle={isEdit ? "Edit any section — jump between them freely." : "Set up leagues, seasons, clinics, and custom programs."}
      title={isEdit ? "Program settings" : "Create program"}
    />
  );
}
