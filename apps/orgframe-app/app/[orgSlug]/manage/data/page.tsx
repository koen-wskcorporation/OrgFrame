import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { loadWorkspacePageData } from "@/src/features/workspace/loadWorkspacePageData";
import { OrgWorkspaceHub } from "@/src/features/workspace/components/OrgWorkspaceHub";

export const metadata: Metadata = {
  title: "Data"
};

export default async function OrgManageDataPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ from?: string; tool?: string; view?: string }>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const data = await loadWorkspacePageData(orgSlug);

  const view = query.view === "data" ? "data" : "dashboard";

  return (
    <PageStack className="px-3 sm:px-4 md:px-6">
      <PageHeader
        className="py-3 md:py-4"
        description="Organization data overview, dashboards, and AI-assisted import tools."
        showBorder={false}
        title="Data"
      />
      <OrgWorkspaceHub
        canAccessImports={data.canAccessImports}
        importRuns={data.importData.runs}
        initialConflicts={data.importData.activeRunConflicts}
        initialOverview={data.overview}
        orgName={data.orgContext.orgName}
        orgSlug={data.orgContext.orgSlug}
        page={view}
        redirectedFromTool={query.from === "legacy-disabled" ? query.tool ?? null : null}
        unresolvedConflicts={data.importData.unresolvedConflicts}
        activeRunId={data.importData.activeRunId}
      />
    </PageStack>
  );
}
