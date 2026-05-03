import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { getAuditEventsPage } from "@/src/features/audit/actions";
import { AuditLogPanel } from "@/src/features/audit/components/AuditLogPanel";

export const metadata: Metadata = {
  title: "Audit log"
};

export default async function OrgManageAuditPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  if (!can(orgContext.membershipPermissions, "audit.read")) {
    redirect("/forbidden?reason=audit-read");
  }

  const initialPage = await getAuditEventsPage({ orgSlug, page: 1, pageSize: 50 });

  return (
    <PageStack>
      <PageHeader
        description="Every write and serious read taken in this org over the last year, including AI-driven actions on behalf of users."
        showBorder={false}
        title="Audit log"
      />
      <AuditLogPanel orgSlug={orgSlug} initialPage={initialPage} />
    </PageStack>
  );
}
