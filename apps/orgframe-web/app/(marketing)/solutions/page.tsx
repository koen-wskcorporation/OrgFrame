import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid, type FeatureGridItem } from "@/components/marketing/FeatureGrid";
import { Reveal } from "@/components/marketing/Reveal";
import { CTA } from "@/components/marketing/CTA";
import { SOLUTIONS } from "@/src/shared/marketing/solutions";

export const metadata: Metadata = {
  title: "Solutions — OrgFrame",
  description: "OrgFrame for clubs, leagues, associations, and facilities."
};

export default function SolutionsPage() {
  const items: FeatureGridItem[] = SOLUTIONS.map((s) => ({
    title: s.name,
    summary: s.summary,
    href: `/solutions/${s.slug}`,
    icon: s.icon
  }));

  return (
    <>
      <section className="relative border-b border-[hsl(var(--rule))]">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative container-editorial py-20 md:py-28 lg:py-32">
          <SectionHeading
            as="h1"
            eyebrow="Solutions"
            title="Built for the shape of your organization."
            lede="A club runs differently than a league. A facility runs differently than an association. OrgFrame meets each of you where you actually operate."
            variant="display"
          />
        </div>
      </section>

      <Section tone="paper" size="md">
        <Reveal>
          <FeatureGrid columns={2} items={items} />
        </Reveal>
      </Section>

      <CTA
        title="Not sure which shape you are?"
        body="Most organizations are more than one. We'll help you map your operations to the modules that matter."
        primary={{ label: "Talk to us", href: "/contact?topic=demo" }}
        secondary={{ label: "See the product", href: "/product" }}
      />
    </>
  );
}
