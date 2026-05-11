import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";
import { RolesPanel } from "@/src/features/people/roles/components/RolesPanel";
import { getOrgRolesPageData } from "@/src/features/people/roles/actions";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "People — Roles"
};

export default async function OrgPeopleRolesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { unavailable } = await gateManageSection(orgSlug, {
    permission: "people.read",
    tool: "people"
  });

  const unavailableShellProps = {
    description: "Manage accounts and the people they manage.",
    tabs: <PeoplePageTabs active="roles" orgSlug={orgSlug} />,
    title: "People"
  };

  if (unavailable) {
    return <PageShell {...unavailableShellProps}><ToolUnavailablePanel title="People" /></PageShell>;
  }

  const data = await getOrgRolesPageData(orgSlug);

  return (
    <PageShell
      description="Manage accounts and the people they manage."
      tabs={<PeoplePageTabs active="roles" orgSlug={data.orgSlug} />}
      title="People"
    >
      <Section
        description="Built-in roles are managed by OrgFrame. Create custom roles to grant tailored permission sets and assign them to members."
        fill={false}
        title="Roles"
      >
        <RolesPanel
          canManageRoles={data.canManageRoles}
          initialRoles={data.roles}
          loadError={data.loadError}
          orgSlug={data.orgSlug}
        />
      </Section>
    </PageShell>
  );
}
