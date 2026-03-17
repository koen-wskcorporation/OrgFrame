import Link from "next/link";
import { Suspense } from "react";
import { HeaderProgressBar } from "@orgframe/ui/shared/HeaderProgressBar";
import { PrimaryAccountControls } from "@orgframe/ui/shared/PrimaryAccountControls";
import { PrimaryHeaderNav } from "@orgframe/ui/shared/PrimaryHeaderNav";
import { AdaptiveLogo } from "@orgframe/ui/ui/adaptive-logo";

type PrimaryHeaderProps = {
  homeHref?: string;
  currentOrgSlug?: string | null;
  tenantBaseOrigin?: string | null;
};

export function PrimaryHeader({ homeHref = "/", currentOrgSlug = null, tenantBaseOrigin = null }: PrimaryHeaderProps) {
  return (
    <header className="relative z-[200] w-full border-b bg-surface/95 backdrop-blur" id="app-primary-header">
      <Suspense fallback={null}>
        <HeaderProgressBar />
      </Suspense>
      <div className="app-container flex h-16 w-full items-center gap-4">
        <Link className="inline-flex min-w-0 items-center" href={homeHref}>
          <AdaptiveLogo
            alt="Sports SaaS logo"
            className="block max-w-full object-contain"
            src="/brand/logo.svg"
            style={{ height: "auto", maxHeight: "auto", maxWidth: "150px", width: "auto" }}
          />
        </Link>

        <PrimaryHeaderNav homeHref={homeHref} />
        <div className="ml-auto shrink-0">
          <PrimaryAccountControls currentOrgSlug={currentOrgSlug} homeHref={homeHref} tenantBaseOrigin={tenantBaseOrigin} />
        </div>
      </div>
    </header>
  );
}
