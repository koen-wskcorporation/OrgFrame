import type { Metadata } from "next";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { isOrgToolEnabled } from "@/src/features/core/config/tools";
import { getOrgRolesPageData } from "@/src/features/people/actions";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";
import { RolesPanel } from "@/src/features/people/components/RolesPanel";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "People — Roles"
};

export default async function OrgPeopleRolesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const unavailableShellProps = {
    description: "Roles and permissions for this org.",
    tabs: <PeoplePageTabs active="roles" orgSlug={orgSlug} />,
    title: "People"
  };

  if (!isOrgToolEnabled(orgContext.toolAvailability, "people")) {
    return <ManagePageShell {...unavailableShellProps}><ToolUnavailablePanel title="People" /></ManagePageShell>;
  }

  const data = await getOrgRolesPageData(orgSlug);

  return (
    <ManagePageShell
      tabs={<PeoplePageTabs active="roles" orgSlug={orgSlug} />}
      title="People"
      variant="workspace"
    >
      <ManageSection
        description="Roles and permissions for this org."
        fill={false}
        title="Roles"
      >
        <RolesPanel
          canManageRoles={data.canManageRoles}
          initialRoles={data.roles}
          loadError={data.loadError}
          orgSlug={data.orgSlug}
        />
      </ManageSection>
    </ManagePageShell>
  );
}
