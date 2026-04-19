import Link from "next/link";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import { Badge } from "@orgframe/ui/primitives/badge";
import { buttonVariants } from "@orgframe/ui/primitives/button";
import { Card, CardTitle } from "@orgframe/ui/primitives/card";
import { cn } from "@orgframe/ui/primitives/utils";
import { ORG_TYPE_LABELS, type OrgType } from "@/src/shared/org/orgTypes";

type OrgCardProps = {
  orgName: string;
  orgSlug: string;
  orgType?: OrgType | null;
  displayHost?: string;
  iconUrl?: string | null;
  href?: string;
};

function getOrgInitial(orgName: string) {
  return orgName.trim().charAt(0).toUpperCase() || "O";
}

export function OrgCard({ orgName, orgSlug, orgType, displayHost, iconUrl, href }: OrgCardProps) {
  const orgHref = href ?? "/";

  return (
    <Card className="p-5 transition-colors hover:border-text-muted/35 hover:bg-surface-muted/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-control border bg-surface-muted p-2">
            {iconUrl ? (
              <AdaptiveLogo
                alt={`${orgName} logo`}
                className="h-full w-full object-contain"
                src={iconUrl}
                svgClassName="block h-full w-full object-contain"
              />
            ) : (
              <span className="text-base font-semibold text-text">{getOrgInitial(orgName)}</span>
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="text-base font-semibold leading-snug [display:-webkit-box] overflow-hidden text-ellipsis [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {orgName}
              </CardTitle>
              {orgType ? (
                <Badge variant="neutral">{ORG_TYPE_LABELS[orgType]}</Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-text-muted">{displayHost ?? orgSlug}</p>
          </div>
        </div>

        <Link className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "shrink-0")} href={orgHref}>
          Open
        </Link>
      </div>
    </Card>
  );
}
