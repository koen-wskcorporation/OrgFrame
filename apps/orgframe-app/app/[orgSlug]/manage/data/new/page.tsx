import type { Metadata } from "next";
import { Button } from "@orgframe/ui/primitives/button";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { TOOL_DATA_SOURCES } from "@/src/features/data/registry";
import { can } from "@/src/shared/permissions/can";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
import { CollectionBuilder } from "@/src/features/data/components/CollectionBuilder";

export const metadata: Metadata = {
  title: "New collection"
};

export default async function NewCollectionPage({
  params
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
      columns: t.columns.map((c) => ({ key: c.key, label: c.label }))
    }))
  }));

  return (
    <PageShell
      actions={
        <Button href={`/${orgSlug}/manage/data`} size="sm" variant="ghost">
          ← Back
        </Button>
      }
      description="Save a filtered view and pin it alongside your other data sources."
      title="New data collection"
    >
      <Section description="Pick a source and filter the rows you want pinned." fill={false} title="Builder">
        <CollectionBuilder orgSlug={orgSlug} sources={sources} />
      </Section>
    </PageShell>
  );
}
