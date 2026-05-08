"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Save } from "lucide-react";
import { AddressAutocompleteInput } from "@orgframe/ui/primitives/address-autocomplete-input";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import {
  createLocalStoragePersistence,
  useCreateFlow,
  type WizardStep
} from "@orgframe/ui/primitives/create-wizard";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import { useToast } from "@orgframe/ui/primitives/toast";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { uploadAccountImage } from "@/src/features/files/uploads/uploadAccountImage";
import {
  createAccountProfileAction,
  removeProfileShareAction,
  shareAccountProfileAction,
  updateAccountProfileAction
} from "@/src/features/people/account-profiles/actions";
import type {
  PeopleProfile,
  PeopleProfileAddress,
  PeopleProfileLink,
  PeopleRelationshipType
} from "@/src/features/people/types";

export type ProfileWizardShare = {
  email: string;
  /** Kinship label for the share (mother, father, grandma, etc.). */
  kinship: string;
  /** Set on existing shares loaded for edit mode; absent for in-memory creates. */
  linkId?: string;
  inviteStatus?: "none" | "pending" | "accepted" | "expired" | "cancelled";
  /** Full name of the linked account when the email resolved to an existing user. */
  accountDisplayName?: string | null;
};

export type SchoolMode = "address" | "homeschooled" | "other";

export type ProfileWizardState = {
  relationshipType: PeopleRelationshipType;
  /** Specific kinship when relationshipType is "guardian" (child). */
  kinship: string;
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  schoolMode: SchoolMode;
  school: string;
  schoolPlaceId: string;
  grade: string;
  avatarPath: string;
  avatarUrl: string | null;
  address: PeopleProfileAddress;
  shares: ProfileWizardShare[];
};

const RELATIONSHIP_OPTIONS: Array<{
  value: PeopleRelationshipType;
  title: string;
  description: string;
}> = [
  {
    value: "self",
    title: "Myself",
    description: "This profile represents you. You can only have one Myself profile."
  },
  {
    value: "guardian",
    title: "Dependent",
    description: "Someone you care for or manage on their behalf — a child, a player, an aging parent, etc."
  }
];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "nonbinary", label: "Non-binary" },
  { value: "other", label: "Other" }
];

const KINSHIP_OPTIONS: Array<{ value: string; title: string }> = [
  { value: "mother", title: "Mother" },
  { value: "father", title: "Father" },
  { value: "stepmother", title: "Stepmother" },
  { value: "stepfather", title: "Stepfather" },
  { value: "grandmother", title: "Grandmother" },
  { value: "grandfather", title: "Grandfather" },
  { value: "aunt", title: "Aunt" },
  { value: "uncle", title: "Uncle" },
  { value: "sibling", title: "Sibling" },
  { value: "foster_parent", title: "Foster parent" },
  { value: "legal_guardian", title: "Legal guardian" },
  { value: "other", title: "Other" }
];

const SCHOOL_MODE_OPTIONS = [
  { value: "address", label: "Pick a school" },
  { value: "homeschooled", label: "Homeschooled" },
  { value: "other", label: "Other" }
];

const GRADE_OPTIONS = [
  { value: "PreK", label: "Pre-K" },
  { value: "K", label: "Kindergarten" },
  ...Array.from({ length: 12 }).map((_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` })),
  { value: "college", label: "College" }
];

const emptyAddress: PeopleProfileAddress = {};

export const emptyProfileWizardState: ProfileWizardState = {
  // Self is auto-created from the account on first load; new profiles created
  // via the wizard are always Dependents.
  relationshipType: "guardian",
  kinship: "",
  firstName: "",
  lastName: "",
  dob: "",
  sex: "",
  schoolMode: "address",
  school: "",
  schoolPlaceId: "",
  grade: "",
  avatarPath: "",
  avatarUrl: null,
  address: emptyAddress,
  shares: []
};

export function profileWizardStateFromProfile(
  profile: PeopleProfile,
  myLink: PeopleProfileLink,
  shares: Array<{ link: PeopleProfileLink; displayName: string | null }>,
  avatarUrl: string | null
): ProfileWizardState {
  const meta = profile.metadataJson ?? {};
  const kinshipRaw = typeof meta.kinship === "string" ? meta.kinship : "";
  const schoolModeRaw = typeof meta.schoolMode === "string" ? meta.schoolMode : "";
  const schoolMode: SchoolMode =
    schoolModeRaw === "homeschooled" || schoolModeRaw === "other" || schoolModeRaw === "address"
      ? schoolModeRaw
      : profile.school
        ? "address"
        : "address";
  const schoolPlaceId = typeof meta.schoolPlaceId === "string" ? meta.schoolPlaceId : "";
  return {
    relationshipType: myLink.relationshipType,
    kinship: kinshipRaw,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    dob: profile.dob ?? "",
    sex: profile.sex ?? "",
    schoolMode,
    school: profile.school ?? "",
    schoolPlaceId,
    grade: profile.grade ?? "",
    avatarPath: profile.avatarPath ?? "",
    avatarUrl,
    address: profile.addressJson ?? emptyAddress,
    shares: shares
      .filter((s) => s.link.relationshipType !== "self")
      .map((s) => {
        const linkKinship = typeof s.link.metadataJson?.kinship === "string" ? (s.link.metadataJson.kinship as string) : "";
        return {
          email: s.link.pendingInviteEmail ?? s.displayName ?? "Linked account",
          kinship: linkKinship,
          linkId: s.link.id,
          inviteStatus: s.link.inviteStatus,
          accountDisplayName: s.displayName
        };
      })
  };
}

type ProfileWizardPanelProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialState?: ProfileWizardState;
  profileId?: string;
  onSaved?: () => void;
};

function isChildRelationship(state: ProfileWizardState) {
  return state.relationshipType === "guardian";
}

export function ProfileWizardPanel({
  open,
  onClose,
  mode,
  initialState,
  profileId,
  onSaved
}: ProfileWizardPanelProps) {
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const seedState = initialState ?? emptyProfileWizardState;
  const isEdit = mode === "edit";

  const persistence = React.useMemo(
    () =>
      isEdit
        ? undefined
        : createLocalStoragePersistence<ProfileWizardState>("orgframe.wizard.account-profile-create", {
            version: "v2"
          }),
    [isEdit]
  );

  const steps: WizardStep<ProfileWizardState>[] = React.useMemo(
    () => [
      {
        id: "relationship",
        label: "Relationship",
        description: "Who is this profile for?",
        // The Myself profile is auto-managed from the account — skip the
        // relationship picker entirely when editing it.
        skipWhen: (state) => state.relationshipType === "self",
        validate: (state) => {
          const errors: Record<string, string> = {};
          if (!state.relationshipType) errors.relationshipType = "Pick a relationship to continue.";
          if (isChildRelationship(state) && !state.kinship) errors.kinship = "Pick your relationship to continue.";
          return Object.keys(errors).length > 0 ? errors : null;
        },
        render: ({ state, setField, fieldErrors }) => {
          // In create mode the user can only add Dependents — their Myself
          // profile is auto-managed from the account. In edit mode we show
          // the existing relationship but lock changing it.
          const visibleOptions = isEdit
            ? RELATIONSHIP_OPTIONS
            : RELATIONSHIP_OPTIONS.filter((o) => o.value !== "self");
          const isSelf = state.relationshipType === "self";
          return (
            <div className="space-y-3">
              {fieldErrors.relationshipType ? <Alert variant="destructive">{fieldErrors.relationshipType}</Alert> : null}
              {isEdit && isSelf ? (
                <Alert>
                  This is your Myself profile. It mirrors your account and can't be removed.
                </Alert>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who is this profile for">
                {visibleOptions.map((option) => (
                  <SelectionBox
                    description={option.description}
                    disabled={isEdit}
                    key={option.value}
                    label={option.title}
                    onSelectedChange={() => setField("relationshipType", option.value)}
                    selected={state.relationshipType === option.value}
                  />
                ))}
              </div>
              {isChildRelationship(state) ? (
                <FormField error={fieldErrors.kinship} label="Your relationship">
                  <Select
                    onChange={(e) => setField("kinship", e.target.value)}
                    options={KINSHIP_OPTIONS.map((k) => ({ value: k.value, label: k.title }))}
                    placeholder="Select relationship"
                    value={state.kinship}
                  />
                </FormField>
              ) : null}
            </div>
          );
        }
      },
      {
        id: "basics",
        label: "Basic info",
        description: "A few details about this profile.",
        validate: (state) => {
          const errors: Record<string, string> = {};
          if (!state.firstName.trim()) errors.firstName = "First name is required.";
          if (!state.lastName.trim()) errors.lastName = "Last name is required.";
          if (!state.sex) errors.sex = "Pick a value to continue.";
          return Object.keys(errors).length > 0 ? errors : null;
        },
        render: ({ state, setField, setState, fieldErrors }) => {
          const updateAddress = (patch: Partial<PeopleProfileAddress>) =>
            setState((current) => ({ ...current, address: { ...current.address, ...patch } }));
          return (
            <div className="space-y-3">
              <FormField error={fieldErrors.firstName} label="First name">
                <Input onChange={(e) => setField("firstName", e.target.value)} value={state.firstName} />
              </FormField>
              <FormField error={fieldErrors.lastName} label="Last name">
                <Input onChange={(e) => setField("lastName", e.target.value)} value={state.lastName} />
              </FormField>
              <FormField label="Date of birth">
                <Input
                  onChange={(e) => setField("dob", e.target.value)}
                  placeholder="Select date of birth"
                  type="date"
                  value={state.dob}
                />
              </FormField>
              <FormField error={fieldErrors.sex} label="Sex">
                <Select
                  onChange={(e) => setField("sex", e.target.value)}
                  options={SEX_OPTIONS}
                  placeholder="Select sex"
                  value={state.sex}
                />
              </FormField>
              <FormField label="Primary address">
                <AddressAutocompleteInput
                  onChange={(value) => updateAddress({ description: value, placeId: undefined })}
                  onSelectPlace={(place) =>
                    updateAddress({ description: place.description, placeId: place.placeId })
                  }
                  placeholder="Start typing a street address"
                  value={state.address.description ?? ""}
                />
              </FormField>
            </div>
          );
        }
      },
      {
        id: "school",
        label: "School",
        description: "Where do they attend school?",
        skipWhen: (state) => !isChildRelationship(state),
        validate: (state) => {
          if (!isChildRelationship(state)) return null;
          const errors: Record<string, string> = {};
          if (!state.grade) errors.grade = "Pick a grade to continue.";
          if (state.schoolMode === "address" && !state.school.trim()) {
            errors.school = "Pick a school.";
          }
          if (state.schoolMode === "other" && !state.school.trim()) {
            errors.school = "Tell us where they go to school.";
          }
          return Object.keys(errors).length > 0 ? errors : null;
        },
        render: ({ state, setField, fieldErrors }) => (
          <div className="space-y-3">
            <FormField label="School type">
              <Select
                onChange={(e) => {
                  const next = e.target.value as SchoolMode;
                  setField("schoolMode", next);
                  if (next === "homeschooled") {
                    setField("school", "Homeschooled");
                    setField("schoolPlaceId", "");
                  } else {
                    setField("school", "");
                    setField("schoolPlaceId", "");
                  }
                }}
                options={SCHOOL_MODE_OPTIONS}
                value={state.schoolMode}
              />
            </FormField>
            {state.schoolMode === "address" ? (
              <FormField error={fieldErrors.school} label="School">
                <AddressAutocompleteInput
                  onChange={(value) => {
                    setField("school", value);
                  }}
                  onSelectPlace={(place) => {
                    setField("school", place.description);
                    setField("schoolPlaceId", place.placeId);
                  }}
                  placeholder="Search for a school"
                  types={["establishment"]}
                  value={state.school}
                />
              </FormField>
            ) : null}
            {state.schoolMode === "other" ? (
              <FormField error={fieldErrors.school} label="Describe">
                <Input
                  onChange={(e) => setField("school", e.target.value)}
                  placeholder="e.g. Online program, co-op, etc."
                  value={state.school}
                />
              </FormField>
            ) : null}
            <FormField error={fieldErrors.grade} label="Current grade">
              <Select
                onChange={(e) => setField("grade", e.target.value)}
                options={GRADE_OPTIONS}
                placeholder="Select grade"
                value={state.grade}
              />
            </FormField>
          </div>
        )
      },
      {
        id: "share",
        label: "Sharing",
        description: "Invite other accounts to view or manage this profile.",
        // Self profiles aren't shareable — they belong to the account holder.
        skipWhen: (state) => state.relationshipType === "self",
        render: ({ state, setState }) => (
          <ShareEditor
            mode={mode}
            onChange={(next) => setState((cur) => ({ ...cur, shares: next }))}
            profileId={profileId}
            shares={state.shares}
          />
        )
      },
    ],
    [mode, profileId]
  );

  const flow = useCreateFlow<ProfileWizardState>({
    open,
    onClose,
    initialState: seedState,
    steps,
    persistence,
    validateAllOnSubmit: isEdit,
    onSubmit: async (state) => {
      const metadata: Record<string, unknown> = {};
      if (state.relationshipType === "guardian" && state.kinship) {
        metadata.kinship = state.kinship;
      }
      if (isChildRelationship(state)) {
        metadata.schoolMode = state.schoolMode;
        if (state.schoolMode === "address" && state.schoolPlaceId) {
          metadata.schoolPlaceId = state.schoolPlaceId;
        }
      }
      if (mode === "create") {
        const result = await createAccountProfileAction({
          relationshipType: state.relationshipType,
          firstName: state.firstName,
          lastName: state.lastName,
          dob: state.dob || undefined,
          sex: state.sex || undefined,
          school: state.school || undefined,
          grade: state.grade || undefined,
          avatarPath: state.avatarPath || undefined,
          address: state.address,
          metadata,
          shares: state.shares
            .filter((s) => s.email.trim().length > 0 && s.kinship.length > 0)
            .map((s) => ({ email: s.email.trim(), kinship: s.kinship }))
        });
        if (!result.ok) {
          toast({ title: "Could not create profile", description: result.error, variant: "destructive" });
          return { ok: false, message: result.error };
        }
        toast({ title: "Profile created", variant: "success" });
        onSaved?.();
        return { ok: true };
      }

      if (!profileId) {
        return { ok: false, message: "Missing profile id." };
      }

      const result = await updateAccountProfileAction({
        profileId,
        firstName: state.firstName,
        lastName: state.lastName,
        dob: state.dob || undefined,
        sex: state.sex || undefined,
        school: state.school || undefined,
        grade: state.grade || undefined,
        avatarPath: state.avatarPath || undefined,
        address: state.address,
        metadata
      });
      if (!result.ok) {
        toast({ title: "Could not save", description: result.error, variant: "destructive" });
        return { ok: false, message: result.error };
      }
      toast({ title: "Profile updated", variant: "success" });
      onSaved?.();
      return { ok: true };
    }
  });

  const headerName =
    [flow.state.firstName, flow.state.lastName].filter(Boolean).join(" ").trim() ||
    (mode === "edit" ? "Profile" : "New profile");

  const requestClose = React.useCallback(async () => {
    if (flow.submitting) return;
    if (!flow.isDirty) {
      onClose();
      return;
    }
    const ok = await confirm({
      title: "Discard changes?",
      description: "Your unsaved changes will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      variant: "destructive"
    });
    if (ok) {
      if (persistence) await Promise.resolve(persistence.clear()).catch(() => undefined);
      onClose();
    }
  }, [confirm, flow.isDirty, flow.submitting, onClose, persistence]);

  const stepper =
    flow.totalVisible > 1 ? (
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-text-muted">
        {flow.visibleSteps.map((step, index) => {
          const isComplete = index < flow.currentIndex;
          const isCurrent = index === flow.currentIndex;
          const reachable = isEdit ? true : index <= flow.currentIndex;
          return (
            <React.Fragment key={step.id}>
              <button
                className={
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                  (isCurrent
                    ? "border-accent/40 bg-accent/10 text-text"
                    : isComplete && !isEdit
                      ? "border-success/40 bg-success/5 text-success"
                      : "border-border bg-surface text-text-muted hover:bg-surface-muted/60")
                }
                disabled={!reachable || flow.submitting}
                onClick={() => flow.goToIndex(index)}
                type="button"
              >
                {isEdit ? null : <span className="font-medium">{index + 1}. </span>}
                {step.label}
              </button>
              {index < flow.visibleSteps.length - 1 ? <span className="text-text-muted/60">›</span> : null}
            </React.Fragment>
          );
        })}
      </div>
    ) : null;

  const draftBanner =
    flow.restoredFromDraft && flow.isDirty ? (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-control border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-text">
        <span>Restored from your last draft.</span>
        <Button onClick={flow.resetDraft} size="sm" type="button" variant="ghost">
          <RotateCcw className="h-3.5 w-3.5" />
          Start fresh
        </Button>
      </div>
    ) : null;

  const submitLabel = isEdit ? "Save changes" : "Create profile";
  const footer = isEdit ? (
    <>
      <Button disabled={flow.submitting} onClick={requestClose} type="button" variant="ghost">
        Close
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <Button
          disabled={flow.submitting || !flow.isDirty}
          loading={flow.submitting}
          onClick={flow.submit}
          type="button"
        >
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </>
  ) : (
    <>
      <Button intent="cancel" disabled={flow.submitting} onClick={requestClose} type="button" variant="ghost">Cancel</Button>
      <div className="ml-auto flex items-center gap-2">
        {!flow.isFirstStep ? (
          <Button disabled={flow.submitting} onClick={flow.back} type="button" variant="secondary">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
        {flow.isLastStep ? (
          <Button disabled={flow.submitting} loading={flow.submitting} onClick={flow.submit} type="button">
            <Save className="h-4 w-4" />
            {submitLabel}
          </Button>
        ) : (
          <Button disabled={flow.submitting} onClick={flow.next} type="button">
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </>
  );

  return (
    <Panel
      footer={footer}
      headerAvatarAlt={headerName}
      headerAvatarSlot={
        <EditableAvatar
          ariaLabel="Change profile picture"
          disabled={flow.submitting}
          name={headerName}
          onSelect={async (result) => {
            try {
              const asset = await uploadAccountImage({
                file: result.file,
                purpose: "profile-photo",
                crop: result.crop,
                width: result.width,
                height: result.height
              });
              flow.setField("avatarPath", asset.path);
              flow.setField("avatarUrl", asset.publicUrl);
            } catch (err) {
              toast({
                title: "Upload failed",
                description: err instanceof Error ? err.message : "Try again.",
                variant: "destructive"
              });
            }
          }}
          sizePx={44}
          src={flow.state.avatarUrl}
        />
      }
      headerShowAvatar
      onClose={requestClose}
      open={open}
      panelKey="account-profile-wizard"
      pushMode="content"
      subtitle={flow.currentStep?.description}
      title={mode === "create" ? "New profile" : "Edit profile"}
    >
      <div className="space-y-2">
        {stepper}
        {draftBanner}
        {flow.currentStep
          ? flow.currentStep.render({
              state: flow.state,
              setState: flow.setState,
              setField: flow.setField,
              fieldErrors: flow.fieldErrors
            })
          : null}
      </div>
    </Panel>
  );
}

function ShareEditor({
  shares,
  onChange,
  mode,
  profileId
}: {
  shares: ProfileWizardShare[];
  onChange: (next: ProfileWizardShare[]) => void;
  mode: "create" | "edit";
  profileId?: string;
}) {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [kinship, setKinship] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [pendingRemoveId, setPendingRemoveId] = React.useState<string | null>(null);

  const trimmed = email.trim();
  const isValidEmail = /.+@.+\..+/.test(trimmed);
  const isDuplicate = shares.some((s) => s.email.toLowerCase() === trimmed.toLowerCase());
  const canSave = isValidEmail && !isDuplicate && Boolean(kinship) && !submitting;

  const handleSave = async () => {
    if (!canSave) {
      if (!isValidEmail) setError("Enter a valid email address.");
      else if (isDuplicate) setError("That email has already been added.");
      else if (!kinship) setError("Pick a relationship.");
      return;
    }
    setError(null);

    if (mode === "edit" && profileId) {
      setSubmitting(true);
      const result = await shareAccountProfileAction({ profileId, email: trimmed, kinship });
      setSubmitting(false);
      if (!result.ok) {
        toast({ title: "Could not share", description: result.error, variant: "destructive" });
        return;
      }
      onChange([
        ...shares,
        {
          email: trimmed,
          kinship,
          linkId: result.data.linkId,
          inviteStatus: result.data.inviteStatus,
          accountDisplayName: result.data.accountDisplayName ?? null
        }
      ]);
      toast({ title: "Profile shared", variant: "success" });
    } else {
      onChange([...shares, { email: trimmed, kinship }]);
    }
    setEmail("");
    setKinship("");
  };

  const handleRemove = async (share: ProfileWizardShare) => {
    if (mode === "edit" && share.linkId) {
      setPendingRemoveId(share.linkId);
      const result = await removeProfileShareAction({ linkId: share.linkId });
      setPendingRemoveId(null);
      if (!result.ok) {
        toast({ title: "Could not remove share", description: result.error, variant: "destructive" });
        return;
      }
      onChange(shares.filter((s) => s.linkId !== share.linkId));
      toast({ title: "Share removed", variant: "success" });
    } else {
      onChange(shares.filter((s) => s.email !== share.email));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Share this profile with another account by email. If they don't have an account yet, we'll mark
        it as a pending invite tied to that email.
      </p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <FormField label="Email">
        <Input
          disabled={submitting}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSave();
            }
          }}
          placeholder="parent@example.com"
          type="email"
          value={email}
        />
      </FormField>
      <FormField label="Their relationship to profile">
        <Select
          disabled={submitting}
          onChange={(e) => {
            setKinship(e.target.value);
            if (error) setError(null);
          }}
          options={KINSHIP_OPTIONS.map((k) => ({ value: k.value, label: k.title }))}
          placeholder="Select relationship"
          value={kinship}
        />
      </FormField>
      <div>
        <Button intent="save" disabled={!canSave} loading={submitting} onClick={handleSave} size="sm" type="button">Save</Button>
      </div>
      {shares.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {shares.map((share) => {
            const status = shareStatusForChip(share);
            const removing = pendingRemoveId !== null && share.linkId === pendingRemoveId;
            const title = share.accountDisplayName ?? share.email;
            const kinshipLabel = KINSHIP_OPTIONS.find((k) => k.value === share.kinship)?.title;
            return (
              <EntityChip
                accessory={
                  kinshipLabel ? <Chip color="neutral" label={kinshipLabel} status={false} /> : null
                }
                hideAvatar
                key={share.linkId ?? share.email}
                name={title}
                onRemove={removing ? undefined : () => void handleRemove(share)}
                status={status}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function shareStatusForChip(share: ProfileWizardShare) {
  const status = share.inviteStatus ?? "pending";
  if (status === "accepted") {
    return { color: "success" as const, label: "Active", showDot: true };
  }
  if (status === "expired" || status === "cancelled") {
    return { color: "neutral" as const, label: status === "expired" ? "Expired" : "Cancelled", showDot: true };
  }
  return { color: "warning" as const, label: "Pending", showDot: true };
}

