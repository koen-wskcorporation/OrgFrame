import type { Metadata } from "next";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import {
  listOrgPagesForManage,
  listOrgSiteStructureNodesForManage
} from "@/src/features/site/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";
import {
  WebsiteManagerActions,
  WebsiteManagerBody,
  WebsiteManagerProvider
} from "./WebsiteManager";

export const metadata: Metadata = {
  title: "Website"
};

export default async function OrgManageWebsitePage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["org.pages.read", "org.pages.write"],
    tool: "website"
  });

  if (unavailable) {
    return (
      <ManagePageShell
        description="Pages, navigation, and public site structure."
        title="Website"
      >
        <ToolUnavailablePanel title="Website" />
      </ManagePageShell>
    );
  }

  const canWrite = can(orgContext.membershipPermissions, "org.pages.write");
  const [items, pages] = await Promise.all([
    listOrgSiteStructureNodesForManage(orgContext.orgId),
    listOrgPagesForManage(orgContext.orgId)
  ]);

  return (
    <ManagePageShell title="Website" variant="workspace">
      <WebsiteManagerProvider
        canWrite={canWrite}
        initialItems={items}
        initialPages={pages}
        orgSlug={orgContext.orgSlug}
      >
        <ManageSection
          actions={<WebsiteManagerActions />}
          description="Pages, navigation, and public site structure. Drag to reorder or nest."
          fill={false}
          title="Website"
        >
          <WebsiteManagerBody />
        </ManageSection>
      </WebsiteManagerProvider>
    </ManagePageShell>
  );
}
