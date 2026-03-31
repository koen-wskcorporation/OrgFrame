import Link from "next/link";
import { OrgAiCommandCenter } from "@/src/features/ai/components/OrgAiCommandCenter";
import { PrimaryAccountControls } from "@/src/features/core/layout/components/PrimaryAccountControls";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";

type PrimaryHeaderProps = {
  homeHref?: string;
  currentOrgSlug?: string | null;
  tenantBaseOrigin?: string | null;
  orgOptions?: { orgSlug: string; orgName: string; orgLogoUrl?: string | null; orgIconUrl?: string | null }[];
};

export function PrimaryHeader({ homeHref = "/", currentOrgSlug = null, tenantBaseOrigin = null, orgOptions = [] }: PrimaryHeaderProps) {
  return (
    <header className="relative z-[200] w-full border-b bg-surface/95 backdrop-blur" id="app-primary-header">
      <div className="app-container flex h-16 w-full items-center gap-4">
        <Link className="inline-flex min-w-0 items-center" href={homeHref}>
          <AdaptiveLogo
            alt="OrgFrame logo"
            className="block max-w-full object-contain"
            src="/brand/logo.svg"
            style={{ height: "auto", maxHeight: "auto", maxWidth: "150px", width: "auto" }}
          />
        </Link>

        <div className="mx-auto flex min-w-0 flex-1 justify-center px-2">
          <OrgAiCommandCenter initialOrgSlug={currentOrgSlug} orgOptions={orgOptions} />
        </div>
        <div className="ml-auto shrink-0">
          <PrimaryAccountControls currentOrgSlug={currentOrgSlug} homeHref={homeHref} tenantBaseOrigin={tenantBaseOrigin} />
        </div>
      </div>
    </header>
  );
}
