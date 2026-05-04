import type { Metadata } from "next";
import { Card } from "@orgframe/ui/primitives/card";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { listPeopleSystemGroupsWorkspace } from "@/src/features/org-share/server";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";
import { PeopleSystemGroupsTree } from "@/src/features/people/components/PeopleSystemGroupsTree";

export const metadata: Metadata = {
  title: "People Groups"
};

export default async function OrgPeopleGroupsPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgPermission(orgSlug, "people.read");

  if (!isOrgToolEnabled(org.toolAvailability, "people")) {
    return (
      <PageStack>
        <PageHeader
          description="Manage accounts, linked player/staff profiles, and relationship access."
          showBorder={false}
          title="People"
        />
        <ToolUnavailablePanel title="People" />
      </PageStack>
    );
  }

  const groups = await listPeopleSystemGroupsWorkspace(org.orgId).catch(() => []);

  return (
    <PageStack>
      <PageHeader
        description="Manage accounts, linked player/staff profiles, and relationship access."
        showBorder={false}
        title="People"
      />
      <PeoplePageTabs active="groups" orgSlug={orgSlug} />
      <Card>
        <PeopleSystemGroupsTree groups={groups} />
      </Card>
    </PageStack>
  );
}
