import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrgSitePage } from "@/src/features/site/components/OrgSitePage";
import { getOrgSitePageForRender } from "@/src/features/site/server/getOrgSitePageForRender";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";

/**
 * Home page in edit mode.
 *
 * Shares its rendering with `app/[orgSlug]/page.tsx` — same data fetch,
 * same `<OrgSitePage>` — but passes `autoStartEditing={true}` so the page
 * editor opens immediately on mount. The website manager's Edit button
 * routes here for the home row; sub-page rows use the catchall route's
 * `/<slug>/edit` suffix.
 */
export async function generateMetadata({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const pageData = await getOrgSitePageForRender({ orgSlug, pageSlug: "home" });
  if (!pageData.page) return { title: "Edit home" };
  const page = pageData.page;
  const title = `Edit · ${page.seoTitle?.trim() || page.title || "Home"}`;
  const description = page.metaDescription?.trim() || undefined;
  const ogImageUrl = page.ogImagePath ? getOrgAssetPublicUrl(page.ogImagePath) : null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImageUrl ? [{ url: ogImageUrl }] : undefined
    }
  };
}

export default async function OrgEditHomePage({
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
      autoStartEditing
      canEdit={pageData.canEdit}
      initialBlocks={pageData.blocks}
      initialPage={pageData.page}
      initialRuntimeData={pageData.runtimeData}
      manageReturnHref={
        pageData.canEdit ? `/${pageData.orgContext.orgSlug}/manage/website` : undefined
      }
      orgName={pageData.orgContext.orgName}
      orgSlug={pageData.orgContext.orgSlug}
      pageSlug="home"
    />
  );
}
