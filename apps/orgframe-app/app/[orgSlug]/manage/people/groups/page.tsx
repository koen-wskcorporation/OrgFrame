import type { Metadata } from "next";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { listPeopleSystemGroupsWorkspace } from "@/src/features/org-share/server";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";
import { PeopleSystemGroupsTree } from "@/src/features/people/components/PeopleSystemGroupsTree";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "People — Groups"
};

export default async function OrgPeopleGroupsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: "org.manage.read",
    tool: "people"
  });

  const unavailableShellProps = {
    description: "Manage accounts, linked player/staff profiles, and relationship access.",
    tabs: <PeoplePageTabs active="groups" orgSlug={orgSlug} />,
    title: "People"
  };

  if (unavailable) {
    return <ManagePageShell {...unavailableShellProps}><ToolUnavailablePanel title="People" /></ManagePageShell>;
  }

  const groups = await listPeopleSystemGroupsWorkspace(orgContext.orgId).catch(() => []);

  return (
    <ManagePageShell
      tabs={<PeoplePageTabs active="groups" orgSlug={orgSlug} />}
      title="People"
      variant="workspace"
    >
      <ManageSection
        description="Manage accounts, linked player/staff profiles, and relationship access."
        fill={false}
        title="Groups"
      >
        <PeopleSystemGroupsTree groups={groups} />
      </ManageSection>
    </ManagePageShell>
  );
}
