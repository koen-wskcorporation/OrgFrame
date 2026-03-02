import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@/components/ui/card";
import { CardGrid, PageStack } from "@/components/ui/layout";
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
    <PageStack>
      <PageHeader description="Open any workspace tool from this overview." showBorder={false} title="Tools Overview" />
      <CardGrid>
        {toolItems.map((item) => (
          <Card key={item.key}>
            <CardHeaderCompact>
              <CardTitle>{item.label}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeaderCompact>
            <CardContent className="pt-4">
              <Button href={item.href} variant="secondary">
                Open {item.label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </CardGrid>
    </PageStack>
  );
}
