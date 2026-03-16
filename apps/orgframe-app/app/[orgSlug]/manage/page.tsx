import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@orgframe/ui/ui/card";
import { CardGrid, PageStack } from "@orgframe/ui/ui/layout";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { WorkspaceSectionNav } from "@orgframe/ui/ui/workspace-section-nav";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";

export const metadata: Metadata = {
  title: "Manage"
};

type ManageSection = "organization" | "operations";

export default async function OrgManageOverviewPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canManageOrg = can(orgContext.membershipPermissions, "org.manage.read");
  const canReadBranding = can(orgContext.membershipPermissions, "org.branding.read") || can(orgContext.membershipPermissions, "org.branding.write");
  const canReadFacilities = can(orgContext.membershipPermissions, "facilities.read") || can(orgContext.membershipPermissions, "facilities.write");
  const canReadInbox = can(orgContext.membershipPermissions, "communications.read") || can(orgContext.membershipPermissions, "communications.write");

  const cards = [
    {
      section: "organization" as const,
      title: "Org Info",
      description: "View core organization metadata and identifiers.",
      href: `/${orgSlug}/tools/manage/info`,
      cta: "Open Org Info",
      enabled: canManageOrg
    },
    {
      section: "organization" as const,
      title: "Custom Domains",
      description: "Connect your own domain and review DNS setup requirements.",
      href: `/${orgSlug}/tools/manage/domains`,
      cta: "Open Domains",
      enabled: canManageOrg
    },
    {
      section: "organization" as const,
      title: "Branding",
      description: "Update logo, icon, and organization accent color.",
      href: `/${orgSlug}/tools/manage/branding`,
      cta: "Open Branding",
      enabled: canReadBranding
    },
    {
      section: "organization" as const,
      title: "User Accounts",
      description: "Invite users, manage core access levels, and account recovery.",
      href: `/${orgSlug}/tools/manage/access`,
      cta: "Open Accounts & Access",
      enabled: canManageOrg
    },
    {
      section: "organization" as const,
      title: "Billing",
      description: "View subscription details and billing controls.",
      href: `/${orgSlug}/tools/manage/billing`,
      cta: "Open Billing",
      enabled: canManageOrg
    },
    {
      section: "operations" as const,
      title: "Inbox",
      description: "Review unified communications and resolve contact identities.",
      href: `/${orgSlug}/tools/inbox`,
      cta: "Open Inbox",
      enabled: canReadInbox
    },
    {
      section: "operations" as const,
      title: "Facilities",
      description: "Manage facility spaces, bookings, blackouts, and approvals.",
      href: `/${orgSlug}/tools/facilities`,
      cta: "Open Facilities",
      enabled: canReadFacilities
    },
    {
      section: "operations" as const,
      title: "SportsConnect Transfer",
      description: "Import SportsConnect enrollments, guardian accounts, players, and order history.",
      href: `/${orgSlug}/tools/manage/sportsconnect`,
      cta: "Open Transfer Tool",
      enabled: canManageOrg
    }
  ].filter((card) => card.enabled);

  const availableSections = Array.from(new Set(cards.map((card) => card.section)));
  const requestedSection = query.section === "operations" || query.section === "organization" ? query.section : null;
  const activeSection = (requestedSection && availableSections.includes(requestedSection) ? requestedSection : availableSections[0] ?? "organization") as ManageSection;
  const scopedCards = cards.filter((card) => card.section === activeSection);
  const sectionItems = [
    {
      key: "organization" as const,
      label: "Organization",
      description: "Brand, access, domains, and billing settings.",
      href: `/${orgSlug}/manage?section=organization`
    },
    {
      key: "operations" as const,
      label: "Operations",
      description: "Manage day-to-day operational tools.",
      href: `/${orgSlug}/manage?section=operations`
    }
  ].filter((item) => availableSections.includes(item.key));

  return (
    <PageStack>
      <PageHeader
        description="Configure organization details, access, and billing from one place."
        showBorder={false}
        title={`Manage`}
      />

      {sectionItems.length > 1 ? <WorkspaceSectionNav active={activeSection} ariaLabel="Manage sections" items={sectionItems} /> : null}

      {cards.length === 0 ? <Alert variant="info">No organization management modules are available with your current permissions.</Alert> : null}
      <CardGrid>
        {scopedCards.map((card) => (
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
