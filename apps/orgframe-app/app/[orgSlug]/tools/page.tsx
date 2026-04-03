import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { WorkspaceSectionNav } from "@orgframe/ui/primitives/workspace-section-nav";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { ManageCardsRepeater } from "./ManageCardsRepeater";

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
  const tools = orgContext.toolAvailability;

  const cards = [
    {
      section: "organization" as const,
      title: "Org Info",
      description: "View core organization metadata and identifiers.",
      href: "/tools/info",
      cta: "Open Org Info",
      enabled: tools.info && canManageOrg
    },
    {
      section: "organization" as const,
      title: "Custom Domains",
      description: "Connect your own domain and review DNS setup requirements.",
      href: "/tools/domains",
      cta: "Open Domains",
      enabled: tools.domains && canManageOrg
    },
    {
      section: "organization" as const,
      title: "Branding",
      description: "Update logo, icon, and organization accent color.",
      href: "/tools/branding",
      cta: "Open Branding",
      enabled: tools.branding && canReadBranding
    },
    {
      section: "organization" as const,
      title: "People",
      description: "Manage accounts, linked player/staff profiles, and relationship access.",
      href: "/tools/people",
      cta: "Open People",
      enabled: tools.people && canManageOrg
    },
    {
      section: "organization" as const,
      title: "Payments",
      description: "Review transactions and configure Stripe payment settings.",
      href: "/tools/payments",
      cta: "Open Payments",
      enabled: tools.billing && canManageOrg
    },
    {
      section: "operations" as const,
      title: "Inbox",
      description: "Review unified communications and resolve contact identities.",
      href: "/tools/inbox",
      cta: "Open Inbox",
      enabled: tools.inbox && canReadInbox
    },
    {
      section: "operations" as const,
      title: "Facilities",
      description: "Manage facility spaces, bookings, blackouts, and approvals.",
      href: "/tools/facilities",
      cta: "Open Facilities",
      enabled: tools.facilities && canReadFacilities
    },
    {
      section: "operations" as const,
      title: "Smart Import",
      description: "Upload CSV/XLSX files and run staged imports with AI-assisted conflict review.",
      href: "/tools/imports",
      cta: "Open Smart Import",
      enabled: tools.imports && canManageOrg
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
      description: "Brand, access, domains, and payment settings.",
      href: "/tools?section=organization"
    },
    {
      key: "operations" as const,
      label: "Operations",
      description: "Manage day-to-day operational tools.",
      href: "/tools?section=operations"
    }
  ].filter((item) => availableSections.includes(item.key));

  return (
    <PageStack>
      <PageHeader
        description="Configure organization details, access, and payments from one place."
        showBorder={false}
        title={`Manage`}
      />

      {sectionItems.length > 1 ? <WorkspaceSectionNav active={activeSection} ariaLabel="Manage sections" items={sectionItems} /> : null}

      {cards.length === 0 ? <Alert variant="info">No organization management modules are available with your current permissions.</Alert> : null}
      <ManageCardsRepeater cards={scopedCards} />
    </PageStack>
  );
}
