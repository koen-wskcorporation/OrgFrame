import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { Button } from "@orgframe/ui/primitives/button";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { listAccessibleDataSources } from "@/src/features/data/registry";
import { SourcesRepeater, type SourceItem } from "@/src/features/data/components/SourcesRepeater";
import { can } from "@/src/shared/permissions/can";
import type { ResolvedDataSource } from "@/src/features/data/registry/types";

function kindOrder(source: ResolvedDataSource): number {
  if (source.kind === "collection") return source.pinned ? 0 : 1;
  if (source.kind === "tool") return 2;
  return 3;
}

function toSourceItem(orgSlug: string, src: ResolvedDataSource): SourceItem {
  return {
    fqKey: src.fqKey,
    label: src.label,
    description: src.description ?? null,
    tags: src.tags,
    dashboardsCount: src.dashboards.length,
    tablesCount: src.tables.length,
    kindOrder: kindOrder(src),
    pinned: Boolean(src.pinned),
    href: `/${orgSlug}/manage/data/${encodeURIComponent(src.fqKey)}`,
    searchText: [src.label, src.description ?? "", ...src.tags.map((t) => t.label)].join(" "),
  };
}

export const metadata: Metadata = {
  title: "Data",
};

export default async function DataPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "data.read");

  const sources = await listAccessibleDataSources({
    orgId: orgContext.orgId,
    permissions: orgContext.membershipPermissions,
  });

  const canWrite = can(orgContext.membershipPermissions, "data.write");

  return (
    <PageStack>
      <PageHeader
        description="Unified dashboards, tables, and your own pinned collections."
        showBorder={false}
        title="Data"
        actions={
          canWrite ? (
            <Button href={`/${orgSlug}/manage/data/new`} size="sm">
              New collection
            </Button>
          ) : null
        }
      />
      <SourcesRepeater items={sources.map((src) => toSourceItem(orgSlug, src))} />
    </PageStack>
  );
}
