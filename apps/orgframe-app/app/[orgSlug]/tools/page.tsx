import type { Metadata } from "next";
import { PageStack } from "@orgframe/ui/ui/layout";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgAdminNavItems } from "@/lib/org/toolsNav";
import { ToolsRepeater } from "./ToolsRepeater";

export const metadata: Metadata = {
  title: "Tools"
};

export default async function OrgToolsHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  const toolItems = getOrgAdminNavItems(orgContext.orgSlug).filter((item) => item.key !== "tools-overview");

  return (
    <PageStack>
      <PageHeader description="Open any workspace tool from this overview." showBorder={false} title="Tools Overview" />
      <ToolsRepeater items={toolItems} />
    </PageStack>
  );
}
