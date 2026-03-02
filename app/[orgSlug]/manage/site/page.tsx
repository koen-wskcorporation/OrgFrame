import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/lib/permissions/orgCapabilities";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Site"
};

export default async function OrgManageSitePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
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
