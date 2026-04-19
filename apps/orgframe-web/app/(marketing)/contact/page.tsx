import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata: Metadata = {
  title: "Contact — OrgFrame",
  description: "Book a demo or say hello. We reply within one business day."
};

type Topic = "demo" | "sales" | "roadmap" | "other";
const VALID_TOPICS = new Set<Topic>(["demo", "sales", "roadmap", "other"]);

interface PageProps {
  searchParams: Promise<{ topic?: string; module?: string; solution?: string }>;
}

export default async function ContactPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const topic = params.topic && VALID_TOPICS.has(params.topic as Topic) ? (params.topic as Topic) : "demo";

  return (
    <>
      <section className="relative border-b border-[hsl(var(--rule))]">
        <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative container-editorial py-20 md:py-28 lg:py-32">
          <SectionHeading
            as="h1"
            eyebrow={topic === "roadmap" ? "Roadmap feedback" : topic === "sales" ? "Pricing & plans" : "Book a demo"}
            title={
              topic === "roadmap"
                ? "What should we build next?"
                : topic === "sales"
                ? "Let's talk about plans."
                : "See your organization in OrgFrame."
            }
            lede={
              topic === "roadmap"
                ? "The roadmap is shaped by the organizations on it. Tell us what would change your Monday morning."
                : topic === "sales"
                ? "We're in private beta with tailored partner pricing. Share a bit about your org and we'll talk numbers."
                : "A short walkthrough, grounded in your data. Bring a recent roster or registration form and we'll show you the shape of it in OrgFrame."
            }
            variant="display"
          />
        </div>
      </section>

      <Section tone="paper" size="md">
        <div className="grid gap-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <ContactForm defaultTopic={topic} defaultModule={params.module} defaultSolution={params.solution} sourcePath="/contact" />
          </div>

          <aside className="flex flex-col gap-6 border-t border-[hsl(var(--rule))] pt-10 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <div className="flex flex-col gap-3">
              <span className="eyebrow eyebrow-accent">Prefer email?</span>
              <a
                className="group inline-flex items-center gap-2 text-lg font-semibold text-[hsl(var(--ink))]"
                href="mailto:hello@orgframe.com"
              >
                <Mail aria-hidden className="h-5 w-5 text-[hsl(var(--accent-ink))]" />
                hello@orgframe.com
              </a>
              <p className="text-sm leading-relaxed text-[hsl(var(--muted-ink))]">
                We read everything that comes in. We do not send drip sequences or sales cadences.
              </p>
            </div>

            <div className="border-t border-[hsl(var(--rule))] pt-6">
              <span className="eyebrow">What happens after you submit</span>
              <ol className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-[hsl(var(--muted-ink))]">
                <li>
                  <span className="font-semibold text-[hsl(var(--ink))]">1. We reply within one business day</span> — typically same-day in
                  North American hours.
                </li>
                <li>
                  <span className="font-semibold text-[hsl(var(--ink))]">2. We send a short questionnaire</span> so the demo shows your
                  structure, not ours.
                </li>
                <li>
                  <span className="font-semibold text-[hsl(var(--ink))]">3. We walk you through OrgFrame</span> — 30 minutes, no slides.
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
