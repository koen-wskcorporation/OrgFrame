import type { ModuleSlug } from "./modules";

export type RoadmapStatus = "shipped" | "in-progress" | "next" | "later";

export type RoadmapModule = ModuleSlug | "platform";

export interface RoadmapEntry {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  module: RoadmapModule;
  targetQuarter?: string;
  shippedOn?: string;
}

export const ROADMAP: ReadonlyArray<RoadmapEntry> = [
  // Shipped
  {
    id: "core-people-programs",
    title: "People and Programs — unified roster",
    description: "One directory, nested programs and divisions, role-based access. The foundation every other module reads from.",
    status: "shipped",
    module: "platform",
    shippedOn: "2025-11-04"
  },
  {
    id: "calendar-v1",
    title: "Calendar — team and facility views",
    description: "Per-team, per-facility, and per-person views with conflict detection and public subscribe links.",
    status: "shipped",
    module: "calendar",
    shippedOn: "2026-01-18"
  },
  {
    id: "forms-v1",
    title: "Forms — registrations with saved progress",
    description: "Conditional logic, saved-in-progress submissions, Stripe-native checkout, approval flows.",
    status: "shipped",
    module: "forms",
    shippedOn: "2026-02-10"
  },
  {
    id: "payments-connect",
    title: "Payments — Stripe Connect onboarding",
    description: "Self-serve Connect onboarding; orgs own their Stripe accounts; payouts and reporting in-app.",
    status: "shipped",
    module: "payments",
    shippedOn: "2026-03-01"
  },
  {
    id: "imports-ai",
    title: "Imports — AI-assisted migration",
    description: "Paste any export; AI proposes field mappings, flags duplicates, previews before commit. Transactional rollback.",
    status: "shipped",
    module: "imports",
    shippedOn: "2026-03-20"
  },
  {
    id: "site-builder-v1",
    title: "Site Management — visual page builder",
    description: "Block-based editor with live data blocks (schedule, staff, registration) and custom domains.",
    status: "shipped",
    module: "site",
    shippedOn: "2026-04-02"
  },

  // In progress
  {
    id: "workspace-ai-v1",
    title: "Workspace — AI command center v1",
    description: "Natural-language queries across every module, grounded citations, reviewable action chains.",
    status: "in-progress",
    module: "workspace",
    targetQuarter: "2026 Q2"
  },
  {
    id: "facilities-subspaces",
    title: "Facilities — sub-space modeling",
    description: "Half-fields, sheets, courts as first-class sub-spaces with inherited availability rules.",
    status: "in-progress",
    module: "facilities",
    targetQuarter: "2026 Q2"
  },
  {
    id: "communications-inbox",
    title: "Communications — shared department inbox",
    description: "Threaded replies landing in a shared inbox per department; assign, resolve, audit.",
    status: "in-progress",
    module: "communications",
    targetQuarter: "2026 Q2"
  },
  {
    id: "events-public-pages",
    title: "Events — public tournament pages",
    description: "A shareable URL per event with directions, schedule, teams, brackets, and contact.",
    status: "in-progress",
    module: "events",
    targetQuarter: "2026 Q2"
  },

  // Next
  {
    id: "sms-messaging",
    title: "Communications — SMS",
    description: "Two-way SMS with the same targeting as email; per-org sending numbers.",
    status: "next",
    module: "communications",
    targetQuarter: "2026 Q3"
  },
  {
    id: "evaluations",
    title: "Programs — evaluations and tryouts",
    description: "Scorecards, multi-evaluator averaging, tiered placement, offer letters.",
    status: "next",
    module: "programs",
    targetQuarter: "2026 Q3"
  },
  {
    id: "workspace-actions",
    title: "Workspace — scheduled and recurring actions",
    description: "Approved action chains that run on a schedule (e.g., Monday morning balance reminders).",
    status: "next",
    module: "workspace",
    targetQuarter: "2026 Q3"
  },
  {
    id: "facility-rentals",
    title: "Facilities — external rentals with payment links",
    description: "Rent open ice or field time to outside groups with automatic holds and payment collection.",
    status: "next",
    module: "facilities",
    targetQuarter: "2026 Q3"
  },
  {
    id: "payments-installments",
    title: "Payments — season installment plans",
    description: "Per-program installment schedules with dunning, retries, and family-visible balances.",
    status: "next",
    module: "payments",
    targetQuarter: "2026 Q3"
  },

  // Later
  {
    id: "mobile-companion",
    title: "Mobile — coach and parent apps",
    description: "A focused mobile app for coaches (roster, schedule, attendance) and parents (schedule, balance, messages).",
    status: "later",
    module: "platform"
  },
  {
    id: "multi-org-leagues",
    title: "Platform — league roll-ups across member orgs",
    description: "Cross-org reporting and standings for leagues that sit above multiple clubs.",
    status: "later",
    module: "platform"
  },
  {
    id: "api-public",
    title: "Platform — public API and webhooks",
    description: "Read-write API for the organizations that want to build on top of OrgFrame.",
    status: "later",
    module: "platform"
  },
  {
    id: "i18n",
    title: "Platform — localization",
    description: "Starting with French-Canadian and Spanish; every surface translatable, every email multi-lingual.",
    status: "later",
    module: "platform"
  }
];

export function groupByStatus(entries: ReadonlyArray<RoadmapEntry>) {
  return {
    "in-progress": entries.filter((e) => e.status === "in-progress"),
    next: entries.filter((e) => e.status === "next"),
    later: entries.filter((e) => e.status === "later"),
    shipped: entries.filter((e) => e.status === "shipped")
  } as const;
}
