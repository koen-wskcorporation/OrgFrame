import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@/components/ui/card";
import { CardGrid, PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { isOrgFeatureEnabled } from "@/lib/org/features";
import {
  orgWorkspaceEventsPath,
  orgWorkspaceFacilitiesPath,
  orgWorkspaceFormsPath,
  orgWorkspaceProgramsPath,
  orgWorkspaceSettingsPath
} from "@/lib/org/routes";
import { can } from "@/lib/permissions/can";

export const metadata: Metadata = {
  title: "Workspace"
};

export default async function OrgManageOverviewPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");
  const canReadFacilities = can(orgContext.membershipPermissions, "spaces.read") || can(orgContext.membershipPermissions, "spaces.write");
  const canReadForms = can(orgContext.membershipPermissions, "forms.read") || can(orgContext.membershipPermissions, "forms.write");
  const canReadEvents =
    can(orgContext.membershipPermissions, "calendar.read") ||
    can(orgContext.membershipPermissions, "calendar.write") ||
    can(orgContext.membershipPermissions, "events.read") ||
    can(orgContext.membershipPermissions, "events.write");
  const canReadSettings = can(orgContext.membershipPermissions, "org.manage.read");

  const cards = [
    {
      title: "Programs",
      description: "Create and manage program catalogs, structure maps, and schedules.",
      href: orgWorkspaceProgramsPath(orgSlug),
      cta: "Open Programs",
      enabled: canReadPrograms && isOrgFeatureEnabled(orgContext.features, "programs")
    },
    {
      title: "Facilities",
      description: "Manage hierarchy, allocation readiness, and facility detail pages.",
      href: orgWorkspaceFacilitiesPath(orgSlug),
      cta: "Open Facilities",
      enabled: canReadFacilities && isOrgFeatureEnabled(orgContext.features, "facilities")
    },
    {
      title: "Forms",
      description: "Build forms and operate submissions from one workspace.",
      href: orgWorkspaceFormsPath(orgSlug),
      cta: "Open Forms",
      enabled: canReadForms && isOrgFeatureEnabled(orgContext.features, "forms")
    },
    {
      title: "Events",
      description: "Manage calendar entries, occurrences, and scheduling operations.",
      href: orgWorkspaceEventsPath(orgSlug),
      cta: "Open Events",
      enabled: canReadEvents && isOrgFeatureEnabled(orgContext.features, "calendar")
    },
    {
      title: "Settings",
      description: "Configure organization identity, branding, domains, access, features, and billing.",
      href: orgWorkspaceSettingsPath(orgSlug),
      cta: "Open Settings",
      enabled: canReadSettings
    }
  ].filter((card) => card.enabled);

  return (
    <PageStack>
      <PageHeader description="Open internal workspace modules for operations and settings." showBorder={false} title="Workspace" />
      {cards.length === 0 ? <Alert variant="info">No workspace modules are available with your current permissions.</Alert> : null}
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
