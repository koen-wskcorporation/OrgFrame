import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
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
      <PageShell
        description="Pages, navigation, and public site structure."
        title="Website"
      >
        <ToolUnavailablePanel title="Website" />
      </PageShell>
    );
  }

  const canWrite = can(orgContext.membershipPermissions, "org.pages.write");
  const [items, pages] = await Promise.all([
    listOrgSiteStructureNodesForManage(orgContext.orgId),
    listOrgPagesForManage(orgContext.orgId)
  ]);

  return (
    <PageShell description="Pages, navigation, and public site structure. Drag to reorder or nest." title="Website">
      <WebsiteManagerProvider
        canWrite={canWrite}
        displayHost={orgContext.displayHost}
        initialItems={items}
        initialPages={pages}
        orgSlug={orgContext.orgSlug}
      >
        <Section
          actions={<WebsiteManagerActions />}
          description="Pages, navigation, and public site structure. Drag to reorder or nest."
          fill={false}
          title="Website"
        >
          <WebsiteManagerBody />
        </Section>
      </WebsiteManagerProvider>
    </PageShell>
  );
}
