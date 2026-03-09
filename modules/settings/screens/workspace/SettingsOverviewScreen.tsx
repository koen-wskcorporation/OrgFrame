import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@/components/ui/card";
import { CardGrid, PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { orgWorkspaceSettingsSectionPath } from "@/lib/org/routes";
import { can } from "@/lib/permissions/can";

export const metadata: Metadata = {
  title: "Settings"
};

export default async function OrgWorkspaceSettingsOverviewPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canManageOrg = can(orgContext.membershipPermissions, "org.manage.read");
  const canReadBranding = can(orgContext.membershipPermissions, "org.branding.read") || can(orgContext.membershipPermissions, "org.branding.write");

  const cards = [
    {
      title: "General",
      description: "View core organization metadata and governing body details.",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "general"),
      cta: "Open General",
      enabled: canManageOrg
    },
    {
      title: "Domains",
      description: "Connect your own domain and review DNS setup requirements.",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "domains"),
      cta: "Open Domains",
      enabled: canManageOrg
    },
    {
      title: "Branding",
      description: "Update logo, icon, and organization accent color.",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "branding"),
      cta: "Open Branding",
      enabled: canReadBranding
    },
    {
      title: "Access",
      description: "Invite users, manage access levels, and recovery controls.",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "access"),
      cta: "Open Access",
      enabled: canManageOrg
    },
    {
      title: "Features",
      description: "Enable or disable workspace modules for this organization.",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "features"),
      cta: "Open Features",
      enabled: canManageOrg
    },
    {
      title: "Billing",
      description: "View subscription details and future paywall controls.",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "billing"),
      cta: "Open Billing",
      enabled: canManageOrg
    }
  ].filter((card) => card.enabled);

  return (
    <PageStack>
      <PageHeader description="Configure organization settings, feature access, and account controls." showBorder={false} title="Settings" />
      {cards.length === 0 ? <Alert variant="info">No settings modules are available with your current permissions.</Alert> : null}
      <CardGrid>
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeaderCompact>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeaderCompact>
            <CardContent>
              <Button href={card.href} variant="secondary">
                {card.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </CardGrid>
    </PageStack>
  );
}
