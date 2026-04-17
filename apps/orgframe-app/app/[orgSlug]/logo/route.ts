import { NextResponse } from "next/server";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await context.params;
  const org = await getOrgPublicContext(orgSlug);

  if (org.branding.logoPath) {
    const signedUrl = getOrgAssetPublicUrl(org.branding.logoPath);
    if (signedUrl) {
      const response = NextResponse.redirect(signedUrl, { status: 307 });
      response.headers.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return response;
    }
  }

  if (org.branding.iconPath) {
    const signedUrl = getOrgAssetPublicUrl(org.branding.iconPath);
    if (signedUrl) {
      const response = NextResponse.redirect(signedUrl, { status: 307 });
      response.headers.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return response;
    }
  }

  return NextResponse.redirect(new URL("/brand/logo.svg", request.url), { status: 307 });
}
