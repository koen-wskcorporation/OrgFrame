import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
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
      <PageShell
        description="Run staged CSV/XLSX imports with profile mapping, AI conflict assistance, and idempotent apply logs."
        title="Smart Import"
      >
        <ToolUnavailablePanel title="Smart Import" />
      </PageShell>
    );
  }

  const runsResult = await listImportRunsAction({ orgSlug, limit: 20 }).catch(() => ({ runs: [] }));

  return (
    <PageShell title="Smart Import">
      <Section
        description="Run staged CSV/XLSX imports with profile mapping, AI conflict assistance, and idempotent apply logs."
        title="Smart Import"
      >
        <SmartImportWorkspace initialRuns={runsResult.runs} orgSlug={orgContext.orgSlug} />
      </Section>
    </PageShell>
  );
}
