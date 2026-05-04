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
        description="Canvas/floorplan management is temporarily disabled."
        showBorder={false}
        title="Facility placeholder"
      />
      <FacilityTabsNav orgSlug={orgSlug} spaceId={spaceId} />
      {children}
    </PageStack>
  );
}
