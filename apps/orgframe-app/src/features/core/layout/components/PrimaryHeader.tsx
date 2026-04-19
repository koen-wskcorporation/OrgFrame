import Link from "next/link";
import { OrgAiCommandCenter } from "@/src/features/ai/components/OrgAiCommandCenter";
import { PrimaryAccountControls } from "@/src/features/core/layout/components/PrimaryAccountControls";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import type { HeaderAccountState } from "@/src/features/core/layout/types";

type PrimaryHeaderProps = {
  homeHref?: string;
  currentOrgSlug?: string | null;
  tenantBaseOrigin?: string | null;
  orgOptions?: { orgSlug: string; orgName: string; orgLogoUrl?: string | null; orgIconUrl?: string | null }[];
  initialAccountState?: HeaderAccountState | null;
};

export function PrimaryHeader({ homeHref = "/", currentOrgSlug = null, tenantBaseOrigin = null, orgOptions = [], initialAccountState = null }: PrimaryHeaderProps) {
  return (
    <header className="relative z-[200] w-full border-b bg-surface/95 backdrop-blur" id="app-primary-header">
      <div className="app-container grid h-16 w-full grid-cols-[minmax(0,1fr)_minmax(0,26rem)_minmax(0,1fr)] items-center gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center justify-start">
          <Link className="inline-flex min-w-0 items-center" href={homeHref}>
            <AdaptiveLogo
              alt="OrgFrame logo"
              className="block max-w-full object-contain"
              src="/brand/logo.svg"
              style={{ height: "auto", maxHeight: "auto", maxWidth: "110px", width: "auto" }}
            />
          </Link>
        </div>

        <div className="flex min-w-0 items-center justify-center px-1">
          <OrgAiCommandCenter initialOrgSlug={currentOrgSlug} orgOptions={orgOptions} />
        </div>

        <div className="flex min-w-0 items-center justify-end">
          <PrimaryAccountControls
            currentOrgSlug={currentOrgSlug}
            homeHref={homeHref}
            initialState={initialAccountState}
            tenantBaseOrigin={tenantBaseOrigin}
          />
        </div>
      </div>
    </header>
  );
}
