"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";
import { MarketingNavMobile } from "./MarketingNavMobile";

export interface MarketingHeaderProps {
  ctaHref: string;
  ctaLabel: string;
  userEmail?: string | null;
}

const NAV = [
  { label: "Product", href: "/product" },
  { label: "Solutions", href: "/solutions" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" }
] as const;

export function MarketingHeader({ ctaHref, ctaLabel, userEmail }: MarketingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="header-shell sticky top-0 z-40" data-scrolled={scrolled || undefined}>
      <div className="container-editorial flex h-16 items-center justify-between gap-6 md:h-20">
        <Link aria-label="OrgFrame home" className="flex items-center" href="/">
          <Wordmark priority size="md" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-[hsl(var(--muted-ink))] transition-colors hover:bg-[hsl(var(--paper-3))] hover:text-[hsl(var(--ink))]"
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {userEmail ? (
            <span className="hidden text-sm text-[hsl(var(--muted-ink))] xl:inline">{userEmail}</span>
          ) : null}
          <Link
            className="hidden h-10 items-center rounded-full border border-[hsl(var(--rule-strong))] px-4 text-sm font-semibold text-[hsl(var(--ink))] transition-colors hover:bg-[hsl(var(--paper-3))] md:inline-flex"
            href={ctaHref}
          >
            {ctaLabel}
          </Link>
          <Link
            className="btn-primary-cyan hidden h-10 items-center rounded-full border px-5 text-sm font-semibold transition-colors md:inline-flex"
            href="/contact?topic=demo"
          >
            Book a demo
          </Link>
          <MarketingNavMobile ctaHref={ctaHref} ctaLabel={ctaLabel} nav={NAV} />
        </div>
      </div>
    </header>
  );
}
