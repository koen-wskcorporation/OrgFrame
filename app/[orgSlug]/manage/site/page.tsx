import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
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
    <div className="space-y-6">
      <PageHeader description="Page and menu management now lives in the org header." showBorder={false} title="Site" />
      <p className="text-sm text-text-muted">
        Manage your site pages from the org header using <span className="font-semibold text-text">Admin {"->"} Edit menu</span>.
      </p>
      <div>
        <Link className={buttonVariants({ variant: "secondary" })} href={`/${orgContext.orgSlug}`}>
          Go to org site
        </Link>
      </div>
    </div>
  );
}
