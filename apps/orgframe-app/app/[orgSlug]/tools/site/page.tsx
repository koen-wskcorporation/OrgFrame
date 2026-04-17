import type { Metadata } from "next";
import { Button } from "@orgframe/ui/primitives/button";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import { redirect } from "next/navigation";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Site"
};

export default async function OrgManageSitePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "site")) {
    return (
      <PageStack>
        <PageHeader description="Page and menu management now lives in the org header." showBorder={false} title="Site" />
        <ToolUnavailablePanel title="Site" />
      </PageStack>
    );
  }
  const capabilities = getOrgCapabilities(orgContext.membershipPermissions);

  if (!capabilities.pages.canAccess) {
    redirect("/forbidden");
  }

  return (
    <PageStack>
      <PageHeader description="Page and menu management now lives in the org header." showBorder={false} title="Site" />
      <p className="text-sm text-text-muted">
        Manage your site pages from the org header using <span className="font-semibold text-text">Admin {"->"} Edit menu</span>.
      </p>
      <div>
        <Button href={`/${orgContext.orgSlug}`} variant="secondary">
          Go to org site
        </Button>
      </div>
    </PageStack>
  );
}
