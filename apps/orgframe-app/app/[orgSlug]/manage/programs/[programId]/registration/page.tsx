import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { isOrgToolEnabled } from "@/src/features/core/config/tools";
import { can } from "@/src/shared/permissions/can";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getProgramById } from "@/src/features/programs/db/queries";
import { listFormsForProgram } from "@/src/features/forms/db/queries";
import {
  ProgramRegistrationSection,
  type ConnectedExternalRegistration,
  type ConnectedRegistrationForm
} from "@/src/features/programs/components/ProgramRegistrationSection";
import { ToolUnavailablePopup } from "../../../ToolUnavailablePopup";

export const metadata: Metadata = {
  title: "Program Registration"
};

function readExternalRegistration(settingsJson: Record<string, unknown>): ConnectedExternalRegistration | null {
  const raw = settingsJson.externalRegistration;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { url?: unknown; label?: unknown };
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  if (!url) return null;
  const label = typeof candidate.label === "string" && candidate.label.trim().length > 0 ? candidate.label.trim() : null;
  return { url, label };
}

export default async function OrgManageProgramRegistrationPage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  let orgContext;
  try {
    orgContext = await getOrgAuthContext(orgSlug);
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") {
      return <Alert variant="destructive">You don't have access to this program.</Alert>;
    }
    throw error;
  }

  const canRead =
    can(orgContext.membershipPermissions, "programs.read") ||
    can(orgContext.membershipPermissions, "programs.write");
  if (!canRead) {
    return <Alert variant="destructive">You don't have access to this program.</Alert>;
  }
  const canWrite = can(orgContext.membershipPermissions, "programs.write");

  if (!isOrgToolEnabled(orgContext.toolAvailability, "forms")) {
    return <ToolUnavailablePopup toolLabel="Forms" />;
  }

  const program = await getProgramById(orgContext.orgId, programId);
  if (!program) {
    notFound();
  }

  const forms = await listFormsForProgram(orgContext.orgId, programId);
  const liveForm = forms.find((form) => form.status !== "archived") ?? forms[0] ?? null;

  const connectedForm: ConnectedRegistrationForm | null = liveForm
    ? {
        id: liveForm.id,
        name: liveForm.name,
        slug: liveForm.slug,
        status: liveForm.status
      }
    : null;

  const externalRegistration = readExternalRegistration(program.settingsJson);

  return (
    <ProgramRegistrationSection
      canWrite={canWrite}
      connectedForm={connectedForm}
      externalRegistration={externalRegistration}
      orgSlug={orgSlug}
      programId={programId}
      programName={program.name}
      programSlug={program.slug}
    />
  );
}
