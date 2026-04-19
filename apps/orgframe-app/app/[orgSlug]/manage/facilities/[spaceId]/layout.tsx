import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { FacilityTabsNav } from "./FacilityTabsNav";

export default async function FacilityManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;

  return (
    <PageStack>
      <PageHeader
        description="Manage facility map structure on the unified grid canvas."
        showBorder={false}
        title="Facility"
      />
      <FacilityTabsNav orgSlug={orgSlug} spaceId={spaceId} />
      {children}
    </PageStack>
  );
}
