import type { ReactNode } from "react";

interface QuoteProps {
  children: ReactNode;
  attribution: string;
  role?: string;
}

export function Quote({ children, attribution, role }: QuoteProps) {
  return (
    <figure className="mx-auto max-w-4xl">
      <blockquote className="text-balance text-center text-3xl font-medium leading-[1.2] tracking-[-0.02em] text-[hsl(var(--ink))] md:text-4xl lg:text-[2.75rem]">
        <span aria-hidden className="mr-1 text-[hsl(var(--accent-ink))]">“</span>
        {children}
        <span aria-hidden className="ml-1 text-[hsl(var(--accent-ink))]">”</span>
      </blockquote>
      <figcaption className="mt-8 text-center text-sm text-[hsl(var(--muted-ink))]">
        <span className="font-semibold text-[hsl(var(--ink))]">{attribution}</span>
        {role ? <span className="before:mx-2 before:content-['·']">{role}</span> : null}
      </figcaption>
    </figure>
  );
}
