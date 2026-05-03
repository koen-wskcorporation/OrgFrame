import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";
import { Button } from "@orgframe/ui/primitives/button";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { getDataSourceByKey } from "@/src/features/data-center/registry";
import { DashboardView } from "@/src/features/data-center/components/DashboardView";
import { TablesView } from "@/src/features/data-center/components/TablesView";
import { RangeSelector } from "@/src/features/data-center/components/RangeSelector";
import { hydrateLayout, loadDataCenterLayout } from "@/src/features/data-center/layout-storage";
import { normalizeRangeKey, resolveRange } from "@/src/features/data-center/range";
import { can } from "@/src/shared/permissions/can";

export const metadata: Metadata = {
  title: "Data Center",
};

type ViewKey = "dashboard" | "tables";

function normalizeView(raw: string | undefined | null): ViewKey {
  return raw === "tables" ? "tables" : "dashboard";
}

export default async function DataCenterSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; sourceKey: string }>;
  searchParams: Promise<{ range?: string; view?: string }>;
}) {
  const { orgSlug, sourceKey } = await params;
  const query = await searchParams;
  const decodedKey = decodeURIComponent(sourceKey);

  const orgContext = await requireOrgPermission(orgSlug, "data-center.read");

  const source = await getDataSourceByKey({ orgId: orgContext.orgId, fqKey: decodedKey });
  if (!source) notFound();

  const hasSourcePermission = source.permissions.some((p) => can(orgContext.membershipPermissions, p));
  if (!hasSourcePermission) notFound();

  const view = normalizeView(query.view);
  const rangeKey = normalizeRangeKey(query.range);
  const range = resolveRange(rangeKey);

  const [snapshot, savedLayout] = await Promise.all([
    source.loader({
      orgId: orgContext.orgId,
      rangeStart: range.start,
      rangeEnd: range.end,
      entityId: source.entityId ?? null,
      entityType: source.entityType ?? null,
    }),
    loadDataCenterLayout({ orgId: orgContext.orgId, sourceKey: source.fqKey }),
  ]);
  const layout = hydrateLayout(savedLayout, source);

  const qs = query.range && query.range !== "30d" ? `?range=${encodeURIComponent(query.range)}` : "";
  const tablesHref = `/${orgSlug}/manage/data-center/${encodeURIComponent(source.fqKey)}${qs ? `${qs}&view=tables` : "?view=tables"}`;
  const dashboardHref = `/${orgSlug}/manage/data-center/${encodeURIComponent(source.fqKey)}${qs}`;

  return (
    <PageStack className="px-3 sm:px-4 md:px-6">
      <PageHeader
        className="py-3 md:py-4"
        description={source.description}
        showBorder={false}
        title={source.label}
        actions={
          <>
            <RangeSelector value={rangeKey} />
            <Button href={`/${orgSlug}/manage/data-center`} variant="ghost" size="sm">
              ← All sources
            </Button>
          </>
        }
      />

      <PageTabs
        ariaLabel="Data source views"
        active={view}
        items={[
          { key: "dashboard", label: "Dashboard", description: "Charts and KPIs", href: dashboardHref },
          { key: "tables", label: "Tables", description: "Browse raw records", href: tablesHref },
        ]}
      />

      {view === "dashboard" ? (
        <DashboardView source={source} snapshot={snapshot} layout={layout} />
      ) : (
        <TablesView source={source} snapshot={snapshot} />
      )}
    </PageStack>
  );
}
