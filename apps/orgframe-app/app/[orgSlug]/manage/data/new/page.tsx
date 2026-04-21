import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { Button } from "@orgframe/ui/primitives/button";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { TOOL_DATA_SOURCES } from "@/src/features/data/registry";
import { CollectionBuilder } from "@/src/features/data/components/CollectionBuilder";
import { can } from "@/src/shared/permissions/can";

export const metadata: Metadata = {
  title: "New collection",
};

export default async function NewCollectionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "data.write");

  const sources = TOOL_DATA_SOURCES.filter((src) =>
    src.permissions.some((p) => can(orgContext.membershipPermissions, p))
  ).map((src) => ({
    key: src.key,
    label: src.label,
    tables: src.tables.map((t) => ({
      key: t.key,
      label: t.label,
      columns: t.columns.map((c) => ({ key: c.key, label: c.label })),
    })),
  }));

  return (
    <PageStack>
      <PageHeader
        description="Save a filtered view and pin it alongside your other data sources."
        showBorder={false}
        title="New data collection"
        actions={
          <Button href={`/${orgSlug}/manage/data`} variant="ghost" size="sm">
            ← Back
          </Button>
        }
      />
      <CollectionBuilder orgSlug={orgSlug} sources={sources} />
    </PageStack>
  );
}
