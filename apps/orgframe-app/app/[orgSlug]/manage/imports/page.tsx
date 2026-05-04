import type { Metadata } from "next";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
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
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: "org.manage.read",
    tool: "imports"
  });

  if (unavailable) {
    return (
      <ManagePageShell
        description="Run staged CSV/XLSX imports with profile mapping, AI conflict assistance, and idempotent apply logs."
        title="Smart Import"
      >
        <ToolUnavailablePanel title="Smart Import" />
      </ManagePageShell>
    );
  }

  const runsResult = await listImportRunsAction({ orgSlug, limit: 20 }).catch(() => ({ runs: [] }));

  return (
    <ManagePageShell title="Smart Import" variant="workspace">
      <ManageSection
        description="Run staged CSV/XLSX imports with profile mapping, AI conflict assistance, and idempotent apply logs."
        title="Smart Import"
      >
        <SmartImportWorkspace initialRuns={runsResult.runs} orgSlug={orgContext.orgSlug} />
      </ManageSection>
    </ManagePageShell>
  );
}
