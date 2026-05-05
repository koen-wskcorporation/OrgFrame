import type { Metadata } from "next";
import { DashboardV2Page } from "@/src/features/core/dashboard/components/DashboardV2Page";
import { getDashboardV2Context } from "@/src/features/core/dashboard/getDashboardV2Context";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { redirectToAuth } from "@/src/shared/auth/redirectToAuth";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    await redirectToAuth("/");
  }

  const context = await getDashboardV2Context();

  return <DashboardV2Page context={context} />;
}
