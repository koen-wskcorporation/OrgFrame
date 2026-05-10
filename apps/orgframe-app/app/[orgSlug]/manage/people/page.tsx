import type { Metadata } from "next";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { getPeopleDirectoryPageData } from "@/src/features/people/actions";
import { PeopleDirectoryPanel } from "@/src/features/people/components/PeopleDirectoryPanel";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";

export const metadata: Metadata = {
  title: "People"
};

export default async function OrgPeoplePage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const page = query.page ? Number(query.page) : undefined;
  const pageSize = query.pageSize ? Number(query.pageSize) : undefined;

  const data = await getPeopleDirectoryPageData({
    orgSlug,
    ...(Number.isFinite(page) ? { page } : {}),
    ...(Number.isFinite(pageSize) ? { pageSize } : {})
  });

  if (!isOrgToolEnabled(data.toolAvailability, "people")) {
    return (
      <PageShell
        description="Manage accounts, linked player/staff profiles, and relationship access."
        tabs={<PeoplePageTabs active="directory" orgSlug={orgSlug} />}
        title="People"
      >
        <ToolUnavailablePanel title="People" />
      </PageShell>
    );
  }

  return (
    <PageShell
      description="Manage accounts, linked player/staff profiles, and relationship access."
      tabs={<PeoplePageTabs active="directory" orgSlug={data.orgSlug} />}
      title="People"

    >
      <Section
        description="Manage accounts, linked player/staff profiles, and relationship access."
        fill={false}
        title="Directory"
      >
        <PeopleDirectoryPanel
          canWritePeople={data.canWritePeople}
          currentUserId={data.currentUserId}
          initialAccounts={data.directory.accounts}
          loadError={data.loadError}
          orgSlug={data.orgSlug}
        />
      </Section>
    </PageShell>
  );
}
