import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { OrgSitePage } from "@/src/features/site/components/OrgSitePage";
import { getOrgSitePageForRender } from "@/src/features/site/server/getOrgSitePageForRender";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { resolveOrgUrlPath } from "@/src/features/site/db/queries";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";

function titleFromSegments(segments: string[]) {
  const last = segments[segments.length - 1] ?? "";
  return last
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * If the URL ends in `/edit`, treat that as the website manager's "open in
 * edit mode" handoff: strip the segment and tell the renderer to call
 * `enterEditMode()` on mount. The "edit" slug is reserved so this never
 * collides with a user-defined page.
 */
function takeEditSuffix(segments: string[]): { segments: string[]; editing: boolean } {
  if (segments.length > 0 && segments[segments.length - 1].toLowerCase() === "edit") {
    return { segments: segments.slice(0, -1), editing: true };
  }
  return { segments, editing: false };
}

async function resolveSlug(orgSlug: string, segments: string[]) {
  const urlPath = "/" + segments.map((s) => s.toLowerCase()).join("/");
  if (urlPath === "/" || urlPath === "/home") {
    return { kind: "page" as const, pageSlug: "home" };
  }
  const orgRequest = await getOrgRequestContext(orgSlug);
  return resolveOrgUrlPath(orgRequest.org.orgId, urlPath);
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ orgSlug: string; slug: string[] }>;
}): Promise<Metadata> {
  const { orgSlug, slug } = await params;
  const { segments } = takeEditSuffix(slug ?? []);
  const resolved = await resolveSlug(orgSlug, segments);

  if (resolved.kind !== "page") {
    return { title: titleFromSegments(segments) || "Page" };
  }

  const pageData = await getOrgSitePageForRender({ orgSlug, pageSlug: resolved.pageSlug });
  if (!pageData.page) {
    return { title: titleFromSegments(segments) || "Page" };
  }

  const page = pageData.page;
  const title = page.seoTitle?.trim() || page.title || titleFromSegments(segments);
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

export default async function OrgPublicPageBySlug({
  params
}: {
  params: Promise<{ orgSlug: string; slug: string[] }>;
}) {
  const { orgSlug, slug } = await params;
  const { segments, editing } = takeEditSuffix(slug ?? []);

  if (segments.length === 1 && segments[0].toLowerCase() === "home") {
    // /orgSlug/home → /orgSlug; /orgSlug/home/edit → /orgSlug/edit.
    redirect(editing ? `/${orgSlug}/edit` : `/${orgSlug}`);
  }

  const resolved = await resolveSlug(orgSlug, segments);

  if (resolved.kind === "external") {
    redirect(resolved.url);
  }

  if (resolved.kind !== "page") {
    notFound();
  }

  const pageData = await getOrgSitePageForRender({
    orgSlug,
    pageSlug: resolved.pageSlug
  });

  if (!pageData.page || !pageData.blocks) {
    notFound();
  }

  return (
    <OrgSitePage
      autoStartEditing={editing}
      canEdit={pageData.canEdit}
      initialBlocks={pageData.blocks}
      initialPage={pageData.page}
      initialRuntimeData={pageData.runtimeData}
      manageReturnHref={
        pageData.canEdit ? `/${pageData.orgContext.orgSlug}/manage/website` : undefined
      }
      orgName={pageData.orgContext.orgName}
      orgSlug={pageData.orgContext.orgSlug}
      pageSlug={pageData.page.slug}
    />
  );
}
