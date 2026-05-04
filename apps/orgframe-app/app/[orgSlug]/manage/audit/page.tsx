import type { Metadata } from "next";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { getAuditEventsPage } from "@/src/features/audit/actions";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { AuditLogPanel } from "@/src/features/audit/components/AuditLogPanel";

export const metadata: Metadata = {
  title: "Audit log"
};

export default async function OrgManageAuditPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  await gateManageSection(orgSlug, { permission: "audit.read" });
  const initialPage = await getAuditEventsPage({ orgSlug, page: 1, pageSize: 50 });

  return (
    <PageShell description="Every write and serious read taken in this org over the last year, including AI-driven actions on behalf of users." title="Audit log">
      <ManageSection
        description="Every write and serious read taken in this org over the last year, including AI-driven actions on behalf of users."
        fill={false}
        title="Audit log"
      >
        <AuditLogPanel orgSlug={orgSlug} initialPage={initialPage} />
      </ManageSection>
    </PageShell>
  );
}
