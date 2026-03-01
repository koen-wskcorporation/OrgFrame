import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { OrgSitePage } from "@/modules/site-builder/components/OrgSitePage";
import { getOrgSitePageForRender } from "@/modules/site-builder/server/getOrgSitePageForRender";

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ orgSlug: string; pageSlug: string }>;
}): Promise<Metadata> {
  const { pageSlug } = await params;
  return {
    title: pageSlug.toLowerCase() === "home" ? "Home" : titleFromSlug(pageSlug) || "Page"
  };
}

export default async function OrgPublicPageBySlug({
  params
}: {
  params: Promise<{ orgSlug: string; pageSlug: string }>;
}) {
  const { orgSlug, pageSlug } = await params;

  if (pageSlug.toLowerCase() === "home") {
    redirect(`/${orgSlug}`);
  }

  const pageData = await getOrgSitePageForRender({
    orgSlug,
    pageSlug
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
