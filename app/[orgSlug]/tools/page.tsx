import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgAdminNavItems } from "@/lib/org/toolsNav";

export const metadata: Metadata = {
  title: "Tools"
};

export default async function OrgToolsHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  const toolItems = getOrgAdminNavItems(orgContext.orgSlug).filter((item) => item.key !== "tools-overview");

  return (
    <div className="space-y-6">
      <PageHeader description="Open any workspace tool from this overview." showBorder={false} title="Tools Overview" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {toolItems.map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <CardTitle>{item.label}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Link className={buttonVariants({ variant: "secondary" })} href={item.href}>
                Open {item.label}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
