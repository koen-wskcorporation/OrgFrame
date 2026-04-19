import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { can } from "@/src/shared/permissions/can";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { listImportRunsAction } from "@/src/features/imports/actions";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";
import { SmartImportWorkspace } from "./SmartImportWorkspace";

export const metadata: Metadata = {
  title: "Smart Import"
};

export default async function OrgManageImportsPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  if (!isOrgToolEnabled(orgContext.toolAvailability, "imports")) {
    return (
      <PageStack>
        <PageHeader
          description="Run staged CSV/XLSX imports with profile mapping, AI conflict assistance, and idempotent apply logs."
          showBorder={false}
          title="Smart Import"
        />
        <ToolUnavailablePanel title="Smart Import" />
      </PageStack>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");

  if (!canManage) {
    redirect(`/forbidden?reason=imports-manage-guard`);
  }

  const runsResult = await listImportRunsAction({ orgSlug: orgContext.orgSlug, limit: 20 }).catch(() => ({ runs: [] }));

  return (
    <PageStack>
      <PageHeader
        description="Run staged CSV/XLSX imports with profile mapping, AI conflict assistance, and idempotent apply logs."
        showBorder={false}
        title="Smart Import"
      />
      <SmartImportWorkspace initialRuns={runsResult.runs} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
