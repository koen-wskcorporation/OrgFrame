import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { RoadmapTimeline } from "@/components/marketing/RoadmapTimeline";
import { Reveal } from "@/components/marketing/Reveal";
import { CTA } from "@/components/marketing/CTA";
import { StatusBadge } from "@/components/marketing/StatusBadge";
import { ROADMAP } from "@/src/shared/marketing/roadmap";

export const metadata: Metadata = {
  title: "Roadmap — OrgFrame",
  description:
    "What we're building now, next, and later. OrgFrame's product roadmap, published openly and updated as we ship."
};

export default function RoadmapPage() {
  return (
    <>
      <section className="relative border-b border-[hsl(var(--rule))]">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative container-editorial py-20 md:py-28 lg:py-32">
          <SectionHeading
            as="h1"
            eyebrow="Roadmap"
            title="What we're building, in the open."
            lede="Sports organizations run year-round. Our roadmap runs the same way — published publicly, updated as we ship, and honest about the difference between committed work and direction."
            variant="display"
          />
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <StatusBadge status="in-progress" />
            <StatusBadge status="next" />
            <StatusBadge status="later" />
            <StatusBadge status="shipped" />
          </div>
        </div>
      </section>

      <Section tone="paper" size="md">
        <Reveal>
          <RoadmapTimeline entries={ROADMAP} />
        </Reveal>
      </Section>

      <CTA
        title="Something missing?"
        body="Tell us what your organization needs next. The roadmap is shaped by partners."
        primary={{ label: "Share feedback", href: "/contact?topic=roadmap" }}
        secondary={{ label: "See the product", href: "/product" }}
      />
    </>
  );
}
