import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { listAccessibleDataSources } from "@/src/features/data-center/registry";
import { SourcePicker } from "@/src/features/data-center/components/SourcePicker";

export const metadata: Metadata = {
  title: "Data Center",
};

export default async function DataCenterPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "data-center.read");

  const sources = await listAccessibleDataSources({
    orgId: orgContext.orgId,
    permissions: orgContext.membershipPermissions,
  });

  const toolSources = sources.filter((s) => s.kind === "tool");
  const entitySources = sources.filter((s) => s.kind === "entity");

  return (
    <PageStack className="px-3 sm:px-4 md:px-6">
      <PageHeader
        className="py-3 md:py-4"
        description="Unified dashboards and tables pulling from every tool."
        showBorder={false}
        title="Data Center"
      />
      <SourcePicker orgSlug={orgSlug} toolSources={toolSources} entitySources={entitySources} />
    </PageStack>
  );
}
