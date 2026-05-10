import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
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
    return <PageShell {...unavailableShellProps}><ToolUnavailablePanel title="People" /></PageShell>;
  }

  const groups = await listPeopleSystemGroupsWorkspace(orgContext.orgId).catch(() => []);

  return (
    <PageShell
      description="Manage accounts, linked player/staff profiles, and relationship access."
      tabs={<PeoplePageTabs active="groups" orgSlug={orgSlug} />}
      title="People"

    >
      <Section
        description="Manage accounts, linked player/staff profiles, and relationship access."
        fill={false}
        title="Groups"
      >
        <PeopleSystemGroupsTree groups={groups} />
      </Section>
    </PageShell>
  );
}
