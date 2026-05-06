import "./marketing.css";
import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getSessionUser } from "@/src/features/auth/server/getSessionUser";
import { getAppEntryUrl } from "@/src/shared/marketing/appOrigin";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  // Always link to the app root. The app routes signed-in users to the
  // dashboard and unauthenticated users on to the canonical auth host.
  const ctaHref = getAppEntryUrl();
  const ctaLabel = user ? "Open Dashboard" : "Sign In";

  return (
    <div className="marketing min-h-screen flex flex-col">
      <MarketingHeader ctaHref={ctaHref} ctaLabel={ctaLabel} userEmail={user?.email ?? null} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
