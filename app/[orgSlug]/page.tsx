import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrgSitePage } from "@/modules/site-builder/components/OrgSitePage";
import { getOrgSitePageForRender } from "@/modules/site-builder/server/getOrgSitePageForRender";

export const metadata: Metadata = {
  title: "Home"
};

export default async function OrgPublicHomePage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const pageData = await getOrgSitePageForRender({
    orgSlug,
    pageSlug: "home"
  });

  if (!pageData.page || !pageData.blocks) {
    notFound();
  }

  return (
    <OrgSitePage
      canEdit={pageData.canEdit}
      initialBlocks={pageData.blocks}
      initialPage={pageData.page}
      initialRuntimeData={pageData.runtimeData}
      orgName={pageData.orgContext.orgName}
      orgSlug={pageData.orgContext.orgSlug}
      pageSlug={pageData.page.slug}
    />
  );
}
