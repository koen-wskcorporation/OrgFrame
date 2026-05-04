import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { getPeopleDirectoryPageData } from "@/src/features/people/actions";
import { PeopleDirectoryPanel } from "@/src/features/people/components/PeopleDirectoryPanel";
import { PeoplePageTabs } from "@/src/features/people/components/PeoplePageTabs";

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

  return (
    <PageStack>
      <PageHeader
        description="Manage accounts, linked player/staff profiles, and relationship access."
        showBorder={false}
        title="People"
      />
      <PeoplePageTabs active="directory" orgSlug={data.orgSlug} />
      <PeopleDirectoryPanel
        canWritePeople={data.canWritePeople}
        currentUserId={data.currentUserId}
        initialAccounts={data.directory.accounts}
        loadError={data.loadError}
        orgSlug={data.orgSlug}
      />
    </PageStack>
  );
}
