import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { Quote } from "@/components/marketing/Quote";
import { Reveal } from "@/components/marketing/Reveal";
import { CTA } from "@/components/marketing/CTA";
import { SOLUTIONS, getSolution } from "@/src/shared/marketing/solutions";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sol = getSolution(slug);
  if (!sol) return { title: "Solutions — OrgFrame" };
  return { title: `${sol.name} — OrgFrame`, description: sol.summary };
}

export default async function SolutionPage({ params }: PageProps) {
  const { slug } = await params;
  const sol = getSolution(slug);
  if (!sol) notFound();

  return (
    <>
      <section className="relative border-b border-[hsl(var(--rule))]">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative container-editorial py-20 md:py-28">
          <Link className="marketing-link inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-ink))]" href="/solutions">
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            All solutions
          </Link>
          <div className="mt-10 grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--rule-strong))] bg-[hsl(var(--paper-2))]">
                  <sol.icon aria-hidden className="h-6 w-6 text-[hsl(var(--accent-ink))]" />
                </span>
                <span className="eyebrow eyebrow-accent">For {sol.name}</span>
              </div>
              <h1 className="display text-balance">{sol.headline}</h1>
            </div>
            <p className="max-w-xl text-[1.0625rem] leading-relaxed text-[hsl(var(--muted-ink))]">{sol.lede}</p>
          </div>
        </div>
      </section>

      <Section tone="paper" size="md">
        <Reveal>
          <SectionHeading
            eyebrow="What changes"
            title="Where it hurts today — and where it doesn't, after."
            lede="We've picked a few of the moments that tend to define operating a sports organization. Your list is probably longer."
          />
        </Reveal>
        <ul className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[hsl(var(--rule))] bg-[hsl(var(--rule))]">
          {sol.pains.map((p, i) => (
            <Reveal key={p.pain} delay={i * 60} as="li">
              <div className="grid gap-10 bg-[hsl(var(--paper-2))] p-8 md:grid-cols-[1fr_1fr] md:items-center md:gap-14 md:p-12">
                <div>
                  <span className="eyebrow">Today</span>
                  <p className="mt-3 text-xl font-medium tracking-tight text-[hsl(var(--ink))]">{p.pain}</p>
                </div>
                <div>
                  <span className="eyebrow eyebrow-accent inline-flex items-center gap-1">
                    With OrgFrame <ArrowRight aria-hidden className="h-3 w-3" />
                  </span>
                  <p className="mt-3 text-[1.0625rem] leading-relaxed text-[hsl(var(--ink))]">{p.capability}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section tone="paper-2" size="md">
        <Reveal>
          <Quote attribution={sol.quote.attribution} role={sol.quote.role}>
            {sol.quote.body}
          </Quote>
        </Reveal>
      </Section>

      <CTA
        title={`See OrgFrame for ${sol.name.toLowerCase()}.`}
        body="Bring a recent roster, schedule, or registration form. We'll show you how it looks in OrgFrame."
        primary={{ label: "Book a demo", href: `/contact?topic=demo&solution=${sol.slug}` }}
        secondary={{ label: "Back to solutions", href: "/solutions" }}
      />
    </>
  );
}
