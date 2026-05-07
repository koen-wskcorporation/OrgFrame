"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { useToast } from "@orgframe/ui/primitives/toast";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import { LocationPicker, type LocationValue } from "@/src/features/facilities/map/components/LocationPicker";
import {
  archiveFacilityAction,
  createFacilityAction,
  updateFacilityAction
} from "@/src/features/facilities/actions";
import type { Facility, FacilityReservationReadModel, FacilitySpaceStatusDef } from "@/src/features/facilities/types";

type WizardState = {
  name: string;
  slug: string;
  isBookable: boolean;
  location: LocationValue | null;
  environment: "indoor" | "outdoor";
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function buildCreateState(): WizardState {
  return {
    name: "",
    slug: "",
    isBookable: true,
    location: null,
    environment: "outdoor"
  };
}

function buildEditState(facility: Facility): WizardState {
  const location: LocationValue | null =
    facility.geoAnchorLat != null && facility.geoAnchorLng != null
      ? { lat: facility.geoAnchorLat, lng: facility.geoAnchorLng, address: facility.geoAddress ?? "" }
      : null;
  return {
    name: facility.name,
    slug: facility.slug,
    // `isBookable` doesn't exist on Facility yet — we treat it as a UI toggle
    // that only matters at the per-space level. Defaulting to true keeps the
    // checkbox checked in the wizard's Configuration step without backing it
    // by real data.
    isBookable: true,
    location,
    environment: facility.environment
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type CreateProps = {
  mode?: "create";
  onCreated?: (readModel: FacilityReservationReadModel) => void;
};

type EditProps = {
  mode: "edit";
  facility: Facility;
  canWrite: boolean;
  onSaved?: (readModel: FacilityReservationReadModel) => void;
  onArchived?: () => void;
};

type SharedProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  spaceStatuses: FacilitySpaceStatusDef[];
  onManageStatuses?: () => void;
};

type SpaceWizardProps = SharedProps & (CreateProps | EditProps);

export function SpaceCreateWizard(props: SpaceWizardProps) {
  const { open, onClose, orgSlug } = props;
  const isEdit = props.mode === "edit";
  const editFacility = isEdit ? props.facility : null;
  const canWrite = isEdit ? props.canWrite : true;
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const router = useRouter();

  const initialState = React.useMemo<WizardState>(
    () => (editFacility ? buildEditState(editFacility) : buildCreateState()),
    [editFacility]
  );

  const [archiving, setArchiving] = React.useState(false);

  async function handleArchive() {
    if (!isEdit || !editFacility) return;
    const confirmed = await confirm({
      title: `Archive "${editFacility.name}"?`,
      description: "This hides the facility from active lists. You can restore it later.",
      confirmLabel: "Archive facility",
      cancelLabel: "Cancel",
      variant: "destructive"
    });
    if (!confirmed) return;
    setArchiving(true);
    try {
      const result = await archiveFacilityAction({ orgSlug, facilityId: editFacility.id });
      if (!result.ok) {
        toast({ title: "Couldn't archive", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Facility archived", variant: "success" });
      onClose();
      router.push(`/${orgSlug}/manage/facilities`);
    } finally {
      setArchiving(false);
    }
  }

  const steps: WizardStep<WizardState>[] = [
    {
      id: "identity",
      label: "Identity",
      description: "Name your facility. The slug is used in URLs and must be unique to your organization.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (state.name.trim().length < 2) {
          errors.name = "Name must be at least 2 characters.";
        }
        const slug = state.slug.trim() || slugify(state.name);
        if (!slug) {
          errors.slug = "A slug is required.";
        } else if (slug.length < 2 || slug.length > 60 || !SLUG_PATTERN.test(slug)) {
          errors.slug = "Use 2-60 lowercase letters, numbers, and hyphens.";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField label="Name" error={fieldErrors.name}>
            <Input
              autoFocus
              disabled={!canWrite}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="e.g. Main Building"
              value={state.name}
            />
          </FormField>
          <FormField label="Slug" hint="Auto-fills from name. Must be unique within your organization." error={fieldErrors.slug}>
            <Input
              disabled={!canWrite}
              onChange={(event) => setField("slug", slugify(event.target.value))}
              onSlugAutoChange={(value) => setField("slug", value)}
              slugAutoEnabled
              slugAutoSource={state.name}
              slugValidation={{
                kind: "space",
                orgSlug,
                debounceMs: 300,
                currentSlug: editFacility?.slug
              }}
              value={state.slug}
            />
          </FormField>
        </div>
      )
    },
    {
      id: "location",
      label: "Location",
      description: "Pick the facility's environment and pin it on a real-world map if applicable.",
      validate: (state) => {
        if (state.environment === "outdoor" && !state.location) {
          return { location: "Pick the facility's location to continue." };
        }
        return null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField label="Environment" hint="Outdoor enables a satellite map background; indoor stays on the design grid.">
            <div className="flex gap-2">
              {(["outdoor", "indoor"] as const).map((env) => (
                <button
                  aria-pressed={state.environment === env}
                  className={`flex-1 rounded-card border px-3 py-2 text-sm font-medium transition-colors ${
                    state.environment === env
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface text-text hover:bg-surface-muted"
                  }`}
                  disabled={!canWrite}
                  key={env}
                  onClick={() => setField("environment", env)}
                  type="button"
                >
                  {env === "outdoor" ? "Outdoor" : "Indoor"}
                </button>
              ))}
            </div>
          </FormField>
          {state.environment === "outdoor" ? (
            <div className="space-y-2">
              {fieldErrors.location ? <p className="text-sm text-destructive">{fieldErrors.location}</p> : null}
              <LocationPicker disabled={!canWrite} onChange={(value) => setField("location", value)} value={state.location} />
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              Indoor facilities don't need a real-world location — you'll lay them out on the design grid.
            </p>
          )}
        </div>
      )
    },
    {
      id: "config",
      label: "Configuration",
      description: "Set booking behavior.",
      validate: () => null,
      render: ({ state, setField }) => (
        <div className="space-y-4">
          <label className="ui-inline-toggle">
            <Checkbox
              checked={state.isBookable}
              disabled={!canWrite}
              onChange={(event) => setField("isBookable", event.target.checked)}
            />
            Bookable facility
          </label>
        </div>
      )
    },
    ...(isEdit
      ? [
          {
            id: "danger",
            label: "Danger zone",
            description: "Archive or remove this facility.",
            render: () => (
              <div className="rounded-control border border-destructive/40 bg-destructive/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Archive facility</p>
                <p className="mt-1 text-sm text-text-muted">
                  Archiving hides the facility from active lists. You can restore it from the archive later.
                </p>
                <div className="mt-3">
                  <Button
                    disabled={!canWrite || archiving}
                    loading={archiving}
                    onClick={handleArchive}
                    variant="danger"
                  >
                    Archive facility
                  </Button>
                </div>
              </div>
            )
          } as WizardStep<WizardState>
        ]
      : [])
  ];

  async function handleSubmit(state: WizardState): Promise<CreateWizardSubmitResult> {
    if (isEdit && editFacility) {
      const result = await updateFacilityAction({
        orgSlug,
        facilityId: editFacility.id,
        name: state.name.trim(),
        slug: state.slug.trim() || slugify(state.name),
        timezone: editFacility.timezone,
        environment: state.environment,
        geoAnchorLat: state.location?.lat ?? null,
        geoAnchorLng: state.location?.lng ?? null,
        geoAddress: state.location?.address?.trim() || null,
        geoShowMap: state.environment === "outdoor" && state.location != null
      });
      if (!result.ok) {
        toast({ title: "Couldn't save", description: result.error, variant: "destructive" });
        return { ok: false, message: result.error };
      }
      toast({ title: "Facility saved", variant: "success" });
      props.onSaved?.(result.data.readModel);
      return { ok: true };
    }

    // create mode
    const result = await createFacilityAction({
      orgSlug,
      name: state.name.trim(),
      slug: state.slug.trim() || slugify(state.name),
      timezone: defaultTimezone(),
      environment: state.environment,
      geoAnchorLat: state.location?.lat ?? null,
      geoAnchorLng: state.location?.lng ?? null,
      geoAddress: state.location?.address?.trim() || null,
      geoShowMap: state.environment === "outdoor" && state.location != null
    });
    if (!result.ok) {
      toast({ title: "Couldn't create", description: result.error, variant: "destructive" });
      const fieldErrors = "fieldErrors" in result ? result.fieldErrors : undefined;
      const stepId = fieldErrors?.slug ? "identity" : fieldErrors?.location ? "location" : fieldErrors ? "config" : undefined;
      return { ok: false, fieldErrors, message: result.error, stepId };
    }
    toast({ title: "Facility created", variant: "success" });
    if (props.mode !== "edit") {
      props.onCreated?.(result.data.readModel);
    }
    return { ok: true };
  }

  return (
    <CreateWizard
      hideCancel
      initialState={initialState}
      mode={isEdit ? "edit" : "create"}
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel={isEdit ? "Save changes" : "Create facility"}
      title={isEdit ? "Facility settings" : "Add facility"}
      subtitle={
        isEdit
          ? "Edit any section — jump between them freely."
          : "Create a top-level facility. You'll add spaces inside it on its map."
      }
    />
  );
}
