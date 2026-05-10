import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

const sectionItems = [
  {
    key: "overview",
    label: "Overview",
    description: "All payment transactions for this organization.",
    href: "/manage/payments"
  },
  {
    key: "links",
    label: "Links",
    description: "Create and manage ad hoc payment links.",
    href: "/manage/payments/links"
  },
  {
    key: "settings",
    label: "Settings",
    description: "Stripe Connect onboarding and tax defaults.",
    href: "/manage/payments/settings"
  }
] as const;

export function PaymentsSectionNav({ active }: { active: "overview" | "settings" | "links" }) {
  return <PageTabs active={active} ariaLabel="Payments sections" items={sectionItems} />;
}
