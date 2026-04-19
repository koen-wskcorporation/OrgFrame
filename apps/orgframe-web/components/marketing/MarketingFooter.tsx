import Link from "next/link";
import { Wordmark } from "./Wordmark";

const PRODUCT = [
  { label: "Overview", href: "/product" },
  { label: "People", href: "/product/people" },
  { label: "Programs", href: "/product/programs" },
  { label: "Calendar", href: "/product/calendar" },
  { label: "Payments", href: "/product/payments" },
  { label: "Workspace AI", href: "/product/workspace" }
];

const SOLUTIONS = [
  { label: "Clubs", href: "/solutions/clubs" },
  { label: "Leagues", href: "/solutions/leagues" },
  { label: "Associations", href: "/solutions/associations" },
  { label: "Facilities", href: "/solutions/facilities" }
];

const COMPANY = [
  { label: "About", href: "/about" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Contact", href: "/contact" }
];

const LEGAL = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" }
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))]">
      <div className="container-editorial py-16 md:py-24">
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Wordmark size="sm" />
            <p className="max-w-xs text-sm leading-relaxed text-[hsl(var(--muted-ink))]">
              One workspace for the operations, registrations, scheduling, and communications of your sports organization.
            </p>
          </div>

          <FooterColumn title="Product" items={PRODUCT} />
          <FooterColumn title="Solutions" items={SOLUTIONS} />
          <FooterColumn title="Company" items={COMPANY} />
          <FooterColumn title="Legal" items={LEGAL} />
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-[hsl(var(--rule))] pt-8 text-sm text-[hsl(var(--muted-ink))] md:flex-row md:items-center">
          <p>© {year} OrgFrame. All rights reserved.</p>
          <p>Built for the people who run the teams.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="eyebrow">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link className="text-sm text-[hsl(var(--ink))] transition-colors hover:text-[hsl(var(--accent-ink))]" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
