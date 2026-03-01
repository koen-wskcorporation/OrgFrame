import { NextResponse } from "next/server";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await context.params;
  const org = await getOrgPublicContext(orgSlug);

  if (org.branding.iconPath) {
    const signedUrl = getOrgAssetPublicUrl(org.branding.iconPath);

    if (signedUrl) {
      const response = NextResponse.redirect(signedUrl, { status: 307 });
      response.headers.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return response;
    }
  }

  return NextResponse.redirect(new URL("/favicon.ico", request.url), { status: 307 });
}
