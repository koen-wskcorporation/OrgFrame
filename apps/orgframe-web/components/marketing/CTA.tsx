import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "./Section";

interface CTAAction {
  label: string;
  href: string;
  external?: boolean;
}

interface CTAProps {
  title: ReactNode;
  body?: ReactNode;
  primary: CTAAction;
  secondary?: CTAAction;
  tone?: "paper" | "paper-2" | "paper-3";
}

export function CTA({ title, body, primary, secondary, tone = "paper-2" }: CTAProps) {
  return (
    <Section tone={tone} size="md">
      <div className="flex flex-col items-start gap-8 border-t border-[hsl(var(--rule))] pt-16 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="headline">{title}</h2>
          {body ? <p className="lede mt-4">{body}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="btn-primary-cyan inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold transition-colors"
            href={primary.href}
            {...(primary.external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {primary.label}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
          {secondary ? (
            <Link
              className="btn-secondary-paper inline-flex h-12 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors"
              href={secondary.href}
              {...(secondary.external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
