import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureSpotlight, SpotlightPlaceholder } from "@/components/marketing/FeatureSpotlight";
import { FAQItem } from "@/components/marketing/FAQItem";
import { FeatureGrid, type FeatureGridItem } from "@/components/marketing/FeatureGrid";
import { ModuleHero } from "@/components/marketing/ModuleHero";
import { ModulePager } from "@/components/marketing/ModulePager";
import { Reveal } from "@/components/marketing/Reveal";
import { CTA } from "@/components/marketing/CTA";
import { MODULES, getModule } from "@/src/shared/marketing/modules";

interface PageProps {
  params: Promise<{ module: string }>;
}

export function generateStaticParams() {
  return MODULES.map((m) => ({ module: m.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { module: slug } = await params;
  const mod = getModule(slug);
  if (!mod) return { title: "Module — OrgFrame" };
  return {
    title: `${mod.name} — OrgFrame`,
    description: mod.summary
  };
}

export default async function ModulePage({ params }: PageProps) {
  const { module: slug } = await params;
  const mod = getModule(slug);
  if (!mod) notFound();

  const index = MODULES.findIndex((m) => m.slug === mod.slug);
  const prev = index > 0 ? MODULES[index - 1] : undefined;
  const next = index < MODULES.length - 1 ? MODULES[index + 1] : undefined;

  const relatedItems: FeatureGridItem[] = mod.related
    .map((s) => MODULES.find((m) => m.slug === s))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({ title: m.name, summary: m.tagline, href: `/product/${m.slug}`, icon: m.icon }));

  return (
    <>
      <ModuleHero
        backHref="/product"
        backLabel="All modules"
        eyebrow={`Module · ${mod.name}`}
        icon={mod.icon}
        lede={mod.lede}
        primary={{ label: "Book a demo", href: `/contact?topic=demo&module=${mod.slug}` }}
        secondary={{ label: "See the roadmap", href: `/roadmap#${mod.slug}` }}
        tagline={mod.tagline}
        title={mod.name}
      />

      <Section tone="paper" size="md">
        <Reveal>
          <SectionHeading
            eyebrow="What it does"
            title="The capabilities that matter."
            lede="Each module is built around the operational questions your team asks every day — not a grab-bag of features."
          />
        </Reveal>
        <div className="mt-16 flex flex-col gap-24 md:gap-32">
          {mod.capabilities.map((cap, i) => (
            <Reveal key={cap.title} delay={i * 60}>
              <FeatureSpotlight
                eyebrow={`0${i + 1}`}
                title={cap.title}
                body={<p>{cap.body}</p>}
                media={<SpotlightPlaceholder label={`${mod.name} · ${cap.title}`} />}
                side={i % 2 === 0 ? "right" : "left"}
              />
            </Reveal>
          ))}
        </div>
      </Section>

      {mod.faq.length > 0 ? (
        <Section tone="paper-2" size="md">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
            <SectionHeading
              eyebrow="Questions"
              title="Good questions people ask."
              lede="If something isn't here, tell us — we'll answer in a walkthrough."
            />
            <div className="border-t border-[hsl(var(--rule))]">
              {mod.faq.map((item, i) => (
                <FAQItem key={item.q} question={item.q} defaultOpen={i === 0}>
                  {item.a}
                </FAQItem>
              ))}
            </div>
          </div>
        </Section>
      ) : null}

      {relatedItems.length > 0 ? (
        <Section tone="paper" size="md">
          <SectionHeading eyebrow="Related" title="Modules that pair with this one." />
          <div className="mt-10">
            <FeatureGrid columns={3} items={relatedItems} />
          </div>
        </Section>
      ) : null}

      <Section tone="paper-2" size="sm">
        <ModulePager
          prev={prev ? { href: `/product/${prev.slug}`, label: prev.name, tagline: prev.tagline } : undefined}
          next={next ? { href: `/product/${next.slug}`, label: next.name, tagline: next.tagline } : undefined}
        />
      </Section>

      <CTA
        title={`Want to see ${mod.name} with your data?`}
        body="Bring a recent export or screenshot — we'll show you what it looks like in OrgFrame in under 30 minutes."
        primary={{ label: "Book a demo", href: `/contact?topic=demo&module=${mod.slug}` }}
        secondary={{ label: "Back to all modules", href: "/product" }}
      />
    </>
  );
}
