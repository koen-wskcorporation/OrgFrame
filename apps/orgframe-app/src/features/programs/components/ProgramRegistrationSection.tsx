"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Pencil } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { GhostCard } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Section } from "@orgframe/ui/primitives/section";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { clearProgramExternalRegistrationAction } from "@/src/features/programs/actions";
import { RegistrationFormCreateWizard } from "@/src/features/programs/components/RegistrationFormCreateWizard";

export type ConnectedRegistrationForm = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
};

export type ConnectedExternalRegistration = {
  url: string;
  label: string | null;
};

type ProgramRegistrationSectionProps = {
  orgSlug: string;
  programId: string;
  programName: string;
  programSlug: string;
  canWrite: boolean;
  connectedForm: ConnectedRegistrationForm | null;
  externalRegistration: ConnectedExternalRegistration | null;
};

export function ProgramRegistrationSection({
  orgSlug,
  programId,
  programName,
  programSlug,
  canWrite,
  connectedForm,
  externalRegistration
}: ProgramRegistrationSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [isClearing, startClearing] = React.useTransition();

  const isConnected = Boolean(connectedForm) || Boolean(externalRegistration);

  async function handleDisconnectExternal() {
    const confirmed = await confirm({
      title: "Remove registration link?",
      description: "Players won't be able to register through this link anymore.",
      confirmLabel: "Remove",
      cancelLabel: "Keep",
      variant: "destructive"
    });
    if (!confirmed) return;

    startClearing(async () => {
      const result = await clearProgramExternalRegistrationAction({ orgSlug, programId });
      if (!result.ok) {
        toast({ title: "Couldn't remove link", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Registration link removed", variant: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <Section
        description="Where players sign up to join this program."
        fill={false}
        title="Registration form"
      >
        {isConnected ? (
          connectedForm ? (
            <ConnectedFormCard canWrite={canWrite} form={connectedForm} orgSlug={orgSlug} />
          ) : externalRegistration ? (
            <ConnectedExternalCard
              canWrite={canWrite}
              isClearing={isClearing}
              onDisconnect={handleDisconnectExternal}
              registration={externalRegistration}
            />
          ) : null
        ) : (
          <NotConnectedCard
            canWrite={canWrite}
            onConnect={() => setWizardOpen(true)}
          />
        )}
      </Section>

      <RegistrationFormCreateWizard
        canWrite={canWrite}
        onClose={() => setWizardOpen(false)}
        open={wizardOpen}
        orgSlug={orgSlug}
        programId={programId}
        programName={programName}
        programSlug={programSlug}
      />
    </>
  );
}

function NotConnectedCard({
  canWrite,
  onConnect
}: {
  canWrite: boolean;
  onConnect: () => void;
}) {
  return (
    <GhostCard className="flex flex-col gap-3 px-5 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text">Not connected</p>
          <p className="text-sm text-text-muted">
            No registration form is connected to this program yet. Connect one to start collecting sign-ups.
          </p>
        </div>
        <Button disabled={!canWrite} intent="add" object="Registration form" onClick={onConnect} />
      </div>
      {!canWrite ? (
        <Alert variant="info">You have read-only access to this program.</Alert>
      ) : null}
    </GhostCard>
  );
}

function ConnectedFormCard({
  canWrite,
  form,
  orgSlug
}: {
  canWrite: boolean;
  form: ConnectedRegistrationForm;
  orgSlug: string;
}) {
  const statusLabel =
    form.status === "published" ? "Published" : form.status === "archived" ? "Archived" : "Draft";
  return (
    <div className="flex flex-col gap-4 rounded-control border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
          <FileText className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text">{form.name}</p>
            <span
              className={
                "rounded-full border px-2 py-0.5 text-xs " +
                (form.status === "published"
                  ? "border-success/40 bg-success/5 text-success"
                  : "border-border bg-surface-muted text-text-muted")
              }
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-text-muted">
            OrgFrame form · /{orgSlug}/forms/{form.slug}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button href={`/manage/forms/${form.id}/editor`} intent="edit" object="form" variant="secondary" disabled={!canWrite}>
          <Pencil className="h-4 w-4" />
          Edit form
        </Button>
        <Button href={`/manage/forms/${form.id}/submissions`} variant="ghost">
          View submissions
        </Button>
      </div>
    </div>
  );
}

function ConnectedExternalCard({
  canWrite,
  isClearing,
  onDisconnect,
  registration
}: {
  canWrite: boolean;
  isClearing: boolean;
  onDisconnect: () => void;
  registration: ConnectedExternalRegistration;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-control border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text">{registration.label ?? "External registration"}</p>
          <Chip label="External link" />
        </div>
        <p className="max-w-md truncate text-xs text-text-muted">{registration.url}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!canWrite || isClearing} intent="remove" loading={isClearing} onClick={onDisconnect}>
          Disconnect
        </Button>
        <a
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-surface-muted"
          href={registration.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" />
          Open link
        </a>
      </div>
    </div>
  );
}
