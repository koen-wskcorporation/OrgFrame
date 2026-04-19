import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { DashboardV2Page } from "@/src/features/core/dashboard/components/DashboardV2Page";
import { getDashboardV2Context } from "@/src/features/core/dashboard/getDashboardV2Context";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { normalizeHost } from "@/src/shared/domains/customDomains";

export const metadata: Metadata = {
  title: "Dashboard"
};

function getMarketingOriginForHost(host: string) {
  const normalizedHost = normalizeHost(host);

  if (normalizedHost === "staging.orgframe.app") {
    return (process.env.NEXT_PUBLIC_STAGING_WEB_ORIGIN ?? process.env.ORGFRAME_STAGING_WEB_ORIGIN ?? "https://staging.orgframeapp.com").replace(/\/+$/, "");
  }

  if (normalizedHost === "orgframe.app") {
    return (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? process.env.ORGFRAME_WEB_ORIGIN ?? "https://orgframeapp.com").replace(/\/+$/, "");
  }

  return null;
}

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    const headerStore = await headers();
    const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = normalizeHost(forwardedHost || headerStore.get("host"));
    const marketingOrigin = getMarketingOriginForHost(host);

    if (marketingOrigin) {
      redirect(marketingOrigin);
    }

    redirect("/auth");
  }

  const context = await getDashboardV2Context();

  return <DashboardV2Page context={context} />;
}
