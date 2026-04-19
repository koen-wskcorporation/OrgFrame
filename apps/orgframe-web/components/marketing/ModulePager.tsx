import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface ModulePagerLink {
  href: string;
  label: string;
  tagline?: string;
}

interface ModulePagerProps {
  prev?: ModulePagerLink;
  next?: ModulePagerLink;
}

export function ModulePager({ prev, next }: ModulePagerProps) {
  return (
    <div className="grid gap-4 border-t border-[hsl(var(--rule))] pt-10 md:grid-cols-2">
      {prev ? (
        <Link
          className="group flex flex-col gap-2 rounded-2xl border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] p-6 transition-colors hover:border-[hsl(var(--rule-strong))]"
          href={prev.href}
        >
          <span className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--muted-ink))]">
            <ArrowLeft aria-hidden className="h-3 w-3" /> Previous
          </span>
          <span className="text-lg font-semibold text-[hsl(var(--ink))] group-hover:text-[hsl(var(--accent-ink))]">{prev.label}</span>
          {prev.tagline ? <span className="text-sm text-[hsl(var(--muted-ink))]">{prev.tagline}</span> : null}
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          className="group flex flex-col gap-2 rounded-2xl border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] p-6 text-right transition-colors hover:border-[hsl(var(--rule-strong))]"
          href={next.href}
        >
          <span className="inline-flex items-center justify-end gap-1.5 text-xs text-[hsl(var(--muted-ink))]">
            Next <ArrowRight aria-hidden className="h-3 w-3" />
          </span>
          <span className="text-lg font-semibold text-[hsl(var(--ink))] group-hover:text-[hsl(var(--accent-ink))]">{next.label}</span>
          {next.tagline ? <span className="text-sm text-[hsl(var(--muted-ink))]">{next.tagline}</span> : null}
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
