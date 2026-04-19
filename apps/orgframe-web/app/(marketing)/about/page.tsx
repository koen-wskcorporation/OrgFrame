import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { Prose } from "@/components/marketing/Prose";
import { Reveal } from "@/components/marketing/Reveal";
import { CTA } from "@/components/marketing/CTA";

export const metadata: Metadata = {
  title: "About — OrgFrame",
  description:
    "OrgFrame is built by people who've spent a decade inside sports organizations. We know where the spreadsheets hide."
};

const PRINCIPLES = [
  {
    name: "Software should disappear.",
    body: "The best tool is the one no one has to think about. Coaches should coach; operators should operate; OrgFrame should fade into the background."
  },
  {
    name: "One roster, always.",
    body: "A person appears once, everywhere. Every module reads from the same source. No reconciliation, no double entry, no stale exports."
  },
  {
    name: "Depth over surface area.",
    body: "We'd rather ship twelve modules that work beautifully with each other than twenty that barely work with themselves."
  },
  {
    name: "Treat volunteers with respect.",
    body: "The people running youth sports are donating time. Our job is to give them their evenings back, not another dashboard to check."
  }
];

export default function AboutPage() {
  return (
    <>
      <section className="relative border-b border-[hsl(var(--rule))]">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative container-editorial py-20 md:py-28 lg:py-32">
          <SectionHeading
            as="h1"
            eyebrow="About OrgFrame"
            title="Built by people who've run the teams."
            lede="OrgFrame was started because the tools sports organizations run on were never built for sports organizations — they were built for something else, and bent until they almost fit."
            variant="display"
          />
        </div>
      </section>

      <Section tone="paper" size="md">
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <span className="eyebrow eyebrow-accent">Origin</span>
              <h2 className="subhead mt-4">Why we built it.</h2>
            </div>
            <Prose>
              <p>
                Every sports organization we worked with had the same drawer of half-solutions: a registration tool from one vendor, a
                scheduling tool from another, a payments processor that never quite talked to either, a Google Drive nobody could find
                anything in, and a group text with forty parents that somebody was going to have to leave.
              </p>
              <p>
                The work those organizations did was beautiful — coaches coaching, parents showing up, leagues running on volunteer time.
                The software was not beautiful. It was in the way. OrgFrame exists to get out of the way.
              </p>
              <p>
                We are a small team with ten years inside sports operations. We are building this slowly and deliberately, with a handful of
                partner organizations, because sports orgs run year-round and we do not have the luxury of breaking anyone's season. When we
                ship, it works. When it doesn't, we answer.
              </p>
            </Prose>
          </div>
        </Reveal>
      </Section>

      <Section tone="paper-2" size="md">
        <Reveal>
          <SectionHeading eyebrow="Principles" title="What we believe." />
        </Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[hsl(var(--rule))] bg-[hsl(var(--rule))] md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.name} delay={i * 60}>
              <div className="flex h-full flex-col gap-3 bg-[hsl(var(--paper-2))] p-8 md:p-10">
                <span className="eyebrow eyebrow-accent">0{i + 1}</span>
                <h3 className="text-xl font-semibold tracking-tight text-[hsl(var(--ink))]">{p.name}</h3>
                <p className="text-[0.95rem] leading-relaxed text-[hsl(var(--muted-ink))]">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="paper" size="md">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <span className="eyebrow eyebrow-accent">Team</span>
            <h2 className="subhead mt-4">Who you'll be working with.</h2>
            <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-[hsl(var(--muted-ink))]">
              We're deliberately small. Every customer talks directly to the people building the product.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <TeamCard initials="KS" name="Koen Stewart" role="Founder, Product & Engineering" />
            <TeamCard initials="—" name="We're hiring" role="Design · Engineering · Partnerships" muted />
          </div>
        </div>
      </Section>

      <CTA
        title="Want to build alongside us?"
        body="We're onboarding partner organizations quarter by quarter. If you see yours in this, we'd love to talk."
        primary={{ label: "Book a demo", href: "/contact?topic=demo" }}
        secondary={{ label: "Say hello", href: "/contact" }}
      />
    </>
  );
}

function TeamCard({ initials, name, role, muted = false }: { initials: string; name: string; role: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-[24px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] p-6">
      <span
        aria-hidden
        className={`inline-flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold tracking-wide ${
          muted
            ? "border border-dashed border-[hsl(var(--rule-strong))] text-[hsl(var(--muted-ink))]"
            : "bg-[hsl(var(--ink))] text-[hsl(var(--paper))]"
        }`}
      >
        {initials}
      </span>
      <div className="flex flex-col">
        <span className={`text-base font-semibold ${muted ? "text-[hsl(var(--muted-ink))]" : "text-[hsl(var(--ink))]"}`}>{name}</span>
        <span className="text-sm text-[hsl(var(--muted-ink))]">{role}</span>
      </div>
    </div>
  );
}
