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
  const segments = slug ?? [];
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
  const segments = slug ?? [];

  if (segments.length === 1 && segments[0].toLowerCase() === "home") {
    redirect(`/${orgSlug}`);
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
