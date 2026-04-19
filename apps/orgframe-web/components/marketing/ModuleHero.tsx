import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";

interface ModuleHeroProps {
  eyebrow: string;
  title: string;
  tagline: string;
  lede: ReactNode;
  icon: LucideIcon;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  backHref?: string;
  backLabel?: string;
}

export function ModuleHero({
  eyebrow,
  title,
  tagline,
  lede,
  icon: Icon,
  primary,
  secondary,
  backHref = "/product",
  backLabel = "All modules"
}: ModuleHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-[hsl(var(--rule))]">
      <div className="paper-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative container-editorial pt-16 pb-20 md:pt-24 md:pb-28">
        <Link
          className="marketing-link inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-ink))]"
          href={backHref}
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
          {backLabel}
        </Link>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--rule-strong))] bg-[hsl(var(--paper-2))]">
                <Icon aria-hidden className="h-6 w-6 text-[hsl(var(--accent-ink))]" />
              </span>
              <span className="eyebrow eyebrow-accent">{eyebrow}</span>
            </div>
            <h1 className="display text-balance">{title}</h1>
            <p className="subhead max-w-2xl text-[hsl(var(--muted-ink))]">{tagline}</p>
          </div>
          <div className="max-w-xl text-[1.0625rem] leading-relaxed text-[hsl(var(--muted-ink))]">{lede}</div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            className="btn-primary-cyan inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold transition-colors"
            href={primary.href}
          >
            {primary.label}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
          {secondary ? (
            <Link
              className="btn-secondary-paper inline-flex h-12 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors"
              href={secondary.href}
            >
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
