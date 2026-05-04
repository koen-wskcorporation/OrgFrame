import { WorkspaceSectionNav } from "@orgframe/ui/primitives/workspace-section-nav";

const sectionItems = [
  {
    key: "overview",
    label: "Overview",
    description: "All payment transactions for this organization.",
    href: "/tools/payments"
  },
  {
    key: "links",
    label: "Links",
    description: "Create and manage ad hoc payment links.",
    href: "/tools/payments/links"
  },
  {
    key: "settings",
    label: "Settings",
    description: "Stripe Connect onboarding and tax defaults.",
    href: "/tools/payments/settings"
  }
] as const;

export function PaymentsSectionNav({ active }: { active: "overview" | "settings" | "links" }) {
  return <WorkspaceSectionNav active={active} ariaLabel="Payments sections" items={sectionItems} />;
}
