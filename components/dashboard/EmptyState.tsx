import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type EmptyStateProps = {
  demoOrgSlug?: string | null;
};

export function EmptyState({ demoOrgSlug }: EmptyStateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No organizations yet</CardTitle>
        <CardDescription>Your account is active, but you do not have organization memberships yet.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Link className={buttonVariants({ size: "sm", variant: "secondary" })} href="/account">
          Account settings
        </Link>
        {demoOrgSlug ? (
          <Link className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/${demoOrgSlug}`}>
            View demo organization
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
