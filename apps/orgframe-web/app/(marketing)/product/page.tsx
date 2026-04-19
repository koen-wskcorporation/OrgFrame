import type { Metadata } from "next";
import { CreditCard, Globe, Sparkles } from "lucide-react";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid, type FeatureGridItem } from "@/components/marketing/FeatureGrid";
import { Reveal } from "@/components/marketing/Reveal";
import { CTA } from "@/components/marketing/CTA";
import { MODULES } from "@/src/shared/marketing/modules";

export const metadata: Metadata = {
  title: "Product — OrgFrame",
  description:
    "Twelve modules, one roster, one workspace. Every operational surface a sports organization needs, designed to work together."
};

export default function ProductPage() {
  const items: FeatureGridItem[] = MODULES.map((m) => ({
    title: m.name,
    summary: m.summary,
    href: `/product/${m.slug}`,
    icon: m.icon
  }));

  return (
    <>
      <section className="relative border-b border-[hsl(var(--rule))]">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative container-editorial py-20 md:py-28 lg:py-32">
          <SectionHeading
            as="h1"
            eyebrow="The Product"
            title="The operating system for sports organizations."
            lede="Twelve modules that share one roster, one calendar, and one workspace. Pick a module to see what it does — or scan the full list first."
            variant="display"
          />
        </div>
      </section>

      <Section tone="paper" size="md">
        <Reveal>
          <FeatureGrid columns={3} items={items} />
        </Reveal>
      </Section>

      <Section tone="paper-2" size="md">
        <Reveal>
          <SectionHeading
            eyebrow="Integrations"
            title="Built on the platforms your organization already trusts."
            lede="No half-built integrations. OrgFrame is wired into the infrastructure you'd pick on your own."
          />
        </Reveal>
        <Reveal delay={80}>
          <ul className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            <IntegrationCard
              icon={<CreditCard aria-hidden className="h-5 w-5" />}
              title="Stripe & Stripe Connect"
              body="Your organization owns its Stripe account. Payments, subscriptions, Connect payouts — all first-class."
            />
            <IntegrationCard
              icon={<Globe aria-hidden className="h-5 w-5" />}
              title="Google Places"
              body="Address autocomplete, maps, and driving directions wherever a facility, event, or team page needs a location."
            />
            <IntegrationCard
              icon={<Sparkles aria-hidden className="h-5 w-5" />}
              title="Claude & Gemini"
              body="Workspace queries are routed through a multi-model gateway. Data access is scoped to your organization and your role."
            />
          </ul>
        </Reveal>
      </Section>

      <CTA
        title="Start with the module that hurts the most."
        body="We'll help you migrate it, wire it to the rest, and expand from there."
        primary={{ label: "Book a demo", href: "/contact?topic=demo" }}
        secondary={{ label: "See the roadmap", href: "/roadmap" }}
      />
    </>
  );
}

function IntegrationCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex flex-col gap-4 rounded-[24px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] p-7">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--rule-strong))] text-[hsl(var(--ink))]">
        {icon}
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">{title}</h3>
        <p className="text-sm leading-relaxed text-[hsl(var(--muted-ink))]">{body}</p>
      </div>
    </li>
  );
}
