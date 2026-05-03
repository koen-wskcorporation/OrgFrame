import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgRolesPageData } from "@/src/features/people/roles/actions";
import { RolesPanel } from "@/src/features/people/roles/components/RolesPanel";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";

export const metadata: Metadata = {
  title: "Roles"
};

export default async function OrgPeopleRolesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  if (!isOrgToolEnabled(orgContext.toolAvailability, "people")) {
    return (
      <PageStack>
        <PageHeader description="Roles and permissions for this org." showBorder={false} title="People" />
        <ToolUnavailablePanel title="People" />
      </PageStack>
    );
  }

  const data = await getOrgRolesPageData(orgSlug);

  return (
    <PageStack>
      <PageHeader
        description="Roles and permissions for this org."
        showBorder={false}
        tabs={<PeoplePageTabs active="roles" orgSlug={data.orgSlug} />}
        title="People"
      />
      <RolesPanel
        canManageRoles={data.canManageRoles}
        initialRoles={data.roles}
        loadError={data.loadError}
        orgSlug={data.orgSlug}
      />
    </PageStack>
  );
}
