import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrgSitePage } from "@/src/features/site/components/OrgSitePage";
import { getOrgSitePageForRender } from "@/src/features/site/server/getOrgSitePageForRender";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";

export async function generateMetadata({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const pageData = await getOrgSitePageForRender({ orgSlug, pageSlug: "home" });
  if (!pageData.page) return { title: "Home" };
  const page = pageData.page;
  const title = page.seoTitle?.trim() || page.title || "Home";
  const description = page.metaDescription?.trim() || undefined;
  const ogImageUrl = page.ogImagePath ? getOrgAssetPublicUrl(page.ogImagePath) : null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImageUrl ? [{ url: ogImageUrl }] : undefined
    },
    twitter: {
      card: ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined
    }
  };
}

export default async function OrgPublicHomePage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  const pageData = await getOrgSitePageForRender({ orgSlug, pageSlug: "home" });

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
      pageSlug="home"
    />
  );
}
