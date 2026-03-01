import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OrgCardProps = {
  orgName: string;
  orgSlug: string;
  iconUrl?: string | null;
};

function getOrgInitial(orgName: string) {
  return orgName.trim().charAt(0).toUpperCase() || "O";
}

export function OrgCard({ orgName, orgSlug, iconUrl }: OrgCardProps) {
  const orgHref = `/${orgSlug}`;

  return (
    <Card className="p-5 transition-colors hover:border-text-muted/35 hover:bg-surface-muted/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-control border bg-surface-muted p-2">
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`${orgName} logo`} className="h-full w-full object-contain" src={iconUrl} />
            ) : (
              <span className="text-base font-semibold text-text">{getOrgInitial(orgName)}</span>
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold leading-snug [display:-webkit-box] overflow-hidden text-ellipsis [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
              {orgName}
            </CardTitle>
            <p className="truncate text-xs text-text-muted">/{orgSlug}</p>
          </div>
        </div>

        <Link className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "shrink-0")} href={orgHref}>
          Open
        </Link>
      </div>
    </Card>
  );
}
