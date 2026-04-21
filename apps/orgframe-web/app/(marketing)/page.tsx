import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid, type FeatureGridItem } from "@/components/marketing/FeatureGrid";
import { FeatureSpotlight, SpotlightPlaceholder } from "@/components/marketing/FeatureSpotlight";
import { Quote } from "@/components/marketing/Quote";
import { ProofStrip } from "@/components/marketing/ProofStrip";
import { CTA } from "@/components/marketing/CTA";
import { Reveal } from "@/components/marketing/Reveal";
import { getSessionUser } from "@/src/features/auth/server/getSessionUser";
import { getAppAuthUrl, getAppDashboardUrl } from "@/src/shared/marketing/appOrigin";
import { MODULES } from "@/src/shared/marketing/modules";

export const metadata: Metadata = {
  title: "OrgFrame — Run your sports organization like it's one thing.",
  description:
    "OrgFrame is the operating system for sports organizations. People, programs, calendars, registrations, payments, communications — in one workspace."
};

export default async function HomePage() {
  const user = await getSessionUser();
  const primaryCta = user ? getAppDashboardUrl() : getAppAuthUrl();
  const primaryLabel = user ? "Open Dashboard" : "Sign In";

  const moduleItems: FeatureGridItem[] = MODULES.map((m) => ({
    title: m.name,
    summary: m.tagline,
    href: `/product/${m.slug}`,
    icon: m.icon
  }));

  return (
    <>
      <Hero primaryLabel={primaryLabel} primaryHref={primaryCta} />

      <Philosophy />

      <Section tone="paper" size="md">
        <Reveal>
          <SectionHeading
            eyebrow="The Platform"
            title="Twelve modules. One roster. One workspace."
            lede="Every operational surface in a sports organization — registrations, scheduling, payments, communications, facilities, public site, everything — designed to work together, not to be glued together."
          />
        </Reveal>
        <Reveal delay={80}>
          <div className="mt-14">
            <FeatureGrid columns={3} items={moduleItems} />
          </div>
        </Reveal>
      </Section>

      <Section tone="paper-2" size="md">
        <Reveal>
          <SectionHeading
            eyebrow="Spotlight · Workspace"
            title="Ask hard questions. Get real actions."
            lede="Workspace sits on top of every module as an AI command center — grounded in your data, scoped to your permissions, and built to act, not just answer."
          />
        </Reveal>
        <div className="mt-16">
          <Reveal delay={80}>
            <FeatureSpotlight
              title="Turn an overdue list into a sent message — in a minute."
              body={
                <>
                  <p>
                    Ask Workspace for the families behind on spring installments. It returns a list grounded in your actual payment data,
                    drafts a targeted message in your organization's voice, and queues it for your approval before it sends.
                  </p>
                  <p className="mt-4">No exports. No copy-paste. Every step auditable. You stay in command.</p>
                </>
              }
              bullets={[
                "Natural-language queries across every module",
                "Chain actions with review before anything is sent or changed",
                "Grounded citations — verify every answer against the source"
              ]}
              media={<SpotlightPlaceholder label="Workspace — Query" />}
              side="right"
            />
          </Reveal>
        </div>
      </Section>

      <Section tone="paper" size="md">
        <Reveal>
          <Quote attribution="Director of Operations" role="East-coast hockey association, OrgFrame beta partner">
            We replaced four tools and a shared drive with OrgFrame. Registrations went from a two-week scramble to a Monday morning review.
          </Quote>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-20">
            <ProofStrip
              stats={[
                { value: "12", label: "Integrated modules" },
                { value: "1 roster", label: "Source of truth" },
                { value: "Under 1 hour", label: "To a live registration form" }
              ]}
            />
          </div>
        </Reveal>
      </Section>

      <CTA
        title="Ready to see it?"
        body="We're in private beta. Book a short walkthrough and we'll show you your organization in OrgFrame."
        primary={{ label: "Book a demo", href: "/contact?topic=demo" }}
        secondary={{ label: "See the roadmap", href: "/roadmap" }}
      />
    </>
  );
}

function Hero({ primaryLabel, primaryHref }: { primaryLabel: string; primaryHref: string }) {
  return (
    <section className="relative overflow-hidden">
      <div className="paper-grid absolute inset-0 opacity-50" aria-hidden />
      <div className="relative container-editorial pt-20 pb-24 md:pt-32 md:pb-36 lg:pt-44 lg:pb-44">
        <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="flex max-w-3xl flex-col gap-8">
            <span className="eyebrow eyebrow-accent">OrgFrame · Sports operations, reimagined</span>
            <h1 className="display text-balance">OrgFrame — run your sports organization like it&rsquo;s one thing.</h1>
            <p className="lede max-w-2xl">
              OrgFrame is an operations platform for clubs, leagues, associations, and facilities. It replaces the registration tool, the
              scheduling tool, the payment tool, the communications tool, and the shared drive — with one workspace that understands how your
              organization actually operates.
            </p>
            <p className="max-w-2xl text-base leading-relaxed text-[hsl(var(--muted-ink))]">
              Built for the people who run sports organizations: directors, registrars, treasurers, coaches, and volunteers. OrgFrame keeps
              your people, programs, calendars, registrations, payments, and communications connected to a single roster — so work stops
              falling between tools.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Link
                className="btn-primary-cyan inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-[0.95rem] font-semibold transition-colors"
                href="/contact?topic=demo"
              >
                Book a demo
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                className="btn-secondary-paper inline-flex h-12 items-center justify-center gap-2 rounded-full border px-5 text-[0.95rem] font-semibold transition-colors"
                href={primaryHref}
              >
                {primaryLabel}
              </Link>
            </div>
            <p className="pt-2 text-sm text-[hsl(var(--muted-ink))]">
              Private beta. Access is limited to partner organizations through early 2026. Read our{" "}
              <Link className="underline underline-offset-2 hover:text-[hsl(var(--ink))]" href="/legal/privacy">
                privacy policy
              </Link>{" "}
              and{" "}
              <Link className="underline underline-offset-2 hover:text-[hsl(var(--ink))]" href="/legal/terms">
                terms of service
              </Link>
              .
            </p>
          </div>

          <div className="hidden lg:block">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[36px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 40% at 20% 10%, hsl(var(--accent-bg) / 0.18) 0%, transparent 70%), linear-gradient(180deg, hsl(var(--paper-2)) 0%, hsl(var(--paper-3)) 100%)"
        }}
      />
      <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative flex h-full flex-col justify-between p-8">
        <div className="flex items-center justify-between">
          <span className="eyebrow eyebrow-accent">Workspace</span>
          <span className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--accent-bg))]" aria-hidden />
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="h-2 w-2/3 rounded-full bg-[hsl(var(--rule-strong))]" />
            <div className="h-2 w-1/2 rounded-full bg-[hsl(var(--rule))]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))]" />
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-[hsl(var(--rule))] bg-[hsl(var(--paper))] p-4">
            <span className="eyebrow">Query</span>
            <p className="text-sm font-medium text-[hsl(var(--ink))]">
              Which U12 families are behind on the spring installment?
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-ink))]">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-ink))]" />
              Reviewing 3 records
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Philosophy() {
  return (
    <section className="border-y border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))]">
      <div className="container-editorial py-20 md:py-28">
        <p className="max-w-4xl text-balance text-2xl font-medium leading-[1.35] tracking-[-0.015em] text-[hsl(var(--ink))] md:text-3xl lg:text-4xl">
          Sports organizations run on people, not platforms. OrgFrame is built to disappear — so the coaches can coach, the directors can
          direct, and the volunteers can go home before midnight.
        </p>
      </div>
    </section>
  );
}
