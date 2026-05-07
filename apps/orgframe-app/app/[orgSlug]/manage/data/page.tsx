import type { Metadata } from "next";
import { Button } from "@orgframe/ui/primitives/button";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { listAccessibleDataSources } from "@/src/features/data/registry";
import { SourcesRepeater, type SourceItem } from "@/src/features/data/components/SourcesRepeater";
import { can } from "@/src/shared/permissions/can";
import type { ResolvedDataSource } from "@/src/features/data/registry/types";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";

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
    searchText: [src.label, src.description ?? "", ...src.tags.map((t) => t.label)].join(" ")
  };
}

export const metadata: Metadata = {
  title: "Data"
};

export default async function DataPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "data.read");

  const sources = await listAccessibleDataSources({
    orgId: orgContext.orgId,
    permissions: orgContext.membershipPermissions
  });

  const canWrite = can(orgContext.membershipPermissions, "data.write");

  return (
    <PageShell description="Unified dashboards, tables, and your own pinned collections." title="Data">
      <ManageSection
        actions={
          canWrite ? (
            <Button href={`/${orgSlug}/manage/data/new`} size="sm">
              New collection
            </Button>
          ) : null
        }
        contentClassName="space-y-4 p-5 md:p-6"
        description="Unified dashboards, tables, and your own pinned collections."
        fill={false}
        title="Data"
      >
        <SourcesRepeater items={sources.map((src) => toSourceItem(orgSlug, src))} />
      </ManageSection>
    </PageShell>
  );
}
