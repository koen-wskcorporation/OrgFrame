import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/ui/alert";
import { PageStack } from "@orgframe/ui/ui/layout";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { can } from "@/lib/permissions/can";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { listRunHistory } from "@/modules/sportsconnect/actions";
import { SportsConnectImportWorkspace } from "@/modules/sportsconnect/components/SportsConnectImportWorkspace";

export const metadata: Metadata = {
  title: "SportsConnect Transfer"
};

export default async function SportsConnectManagePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canManageOrg = can(orgContext.membershipPermissions, "org.manage.read");

  if (!canManageOrg) {
    redirect("/forbidden");
  }

  const runs = await listRunHistory({
    orgSlug: orgContext.orgSlug,
    limit: 20
  }).catch(() => ({ runs: [] }));

  return (
    <PageStack>
      <PageHeader
        description="Upload a SportsConnect export, dry-run mapping, and commit native registrations + order ledger records."
        showBorder={false}
        title="SportsConnect Transfer"
      />
      <Alert variant="info">Account creation during import is silent. Activation emails are only sent when the user requests activation at login.</Alert>
      <SportsConnectImportWorkspace initialRuns={runs.runs} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
