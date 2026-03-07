export type WebsiteProduct = {
  slug: string;
  name: string;
  summary: string;
  description: string;
  priceLabel: string;
  billingInterval: string;
  highlights: string[];
  features: string[];
};

const websiteProducts: WebsiteProduct[] = [
  {
    slug: "program-ops",
    name: "Program Ops",
    summary: "Manage program catalogs, structures, schedules, and team setup in one workflow.",
    description:
      "Program Ops gives directors a single control plane for season planning. Build program structures, publish schedules, and keep updates synchronized for families and staff.",
    priceLabel: "$149",
    billingInterval: "per organization/month",
    highlights: ["Structure builder", "Schedule automation", "Public catalog publishing"],
    features: [
      "Program and division hierarchy management",
      "Recurring schedule rules with override support",
      "Team mapping and roster-ready exports",
      "Public program pages with registration entry points"
    ]
  },
  {
    slug: "registration-forms",
    name: "Registration Forms",
    summary: "Collect signups with configurable forms, payment-ready pipelines, and submission tracking.",
    description:
      "Registration Forms helps organizations launch applications, tryouts, and seasonal signups fast. Build once, reuse templates, and route submissions directly into your operations data.",
    priceLabel: "$99",
    billingInterval: "per organization/month",
    highlights: ["Drag-and-drop form builder", "Submission workflows", "Program-aware fields"],
    features: [
      "Versioned form publishing with drafts",
      "Custom fields for players, guardians, and waivers",
      "Submission queue with filter and status tools",
      "Google Sheets integration for downstream reporting"
    ]
  },
  {
    slug: "facilities-calendar",
    name: "Facilities Calendar",
    summary: "Coordinate fields and venues with real-time availability, bookings, and blackout controls.",
    description:
      "Facilities Calendar keeps every space organized across practices, events, and rentals. Teams can see availability while admins enforce blackout rules and approval workflows.",
    priceLabel: "$129",
    billingInterval: "per organization/month",
    highlights: ["Space hierarchy", "Availability views", "Reservation approvals"],
    features: [
      "Building, floor, and room structure modeling",
      "Calendar views for month, week, and day operations",
      "Blackout windows and maintenance closures",
      "Public-facing availability display for approved spaces"
    ]
  }
];

export function getWebsiteProducts() {
  return websiteProducts;
}

export function getWebsiteProductBySlug(slug: string) {
  return websiteProducts.find((product) => product.slug === slug) ?? null;
}
