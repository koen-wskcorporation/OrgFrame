"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
}

interface MarketingNavMobileProps {
  ctaHref: string;
  ctaLabel: string;
  nav: ReadonlyArray<NavItem>;
}

export function MarketingNavMobile({ ctaHref, ctaLabel, nav }: MarketingNavMobileProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--rule-strong))] text-[hsl(var(--ink))] transition-colors hover:bg-[hsl(var(--paper-3))] lg:hidden"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open ? (
        <div className="fixed inset-0 top-16 z-30 flex flex-col bg-[hsl(var(--paper))] px-6 py-10 md:top-20 lg:hidden">
          <nav aria-label="Mobile primary" className="flex flex-col gap-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                className="rounded-2xl border border-transparent px-4 py-4 text-xl font-semibold text-[hsl(var(--ink))] transition-colors hover:border-[hsl(var(--rule))] hover:bg-[hsl(var(--paper-2))]"
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-3 border-t border-[hsl(var(--rule))] pt-6">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full border border-[hsl(var(--rule-strong))] text-base font-semibold text-[hsl(var(--ink))]"
              href={ctaHref}
              onClick={() => setOpen(false)}
            >
              {ctaLabel}
            </Link>
            <Link
              className="btn-primary-cyan inline-flex h-12 items-center justify-center rounded-full border text-base font-semibold"
              href="/contact?topic=demo"
              onClick={() => setOpen(false)}
            >
              Book a demo
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
