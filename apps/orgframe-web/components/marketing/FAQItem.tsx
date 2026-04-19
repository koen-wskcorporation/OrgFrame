import type { ReactNode } from "react";
import { Plus } from "lucide-react";

interface FAQItemProps {
  question: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function FAQItem({ question, children, defaultOpen = false }: FAQItemProps) {
  return (
    <details className="group border-b border-[hsl(var(--rule))] py-6 last:border-b-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left [&::-webkit-details-marker]:hidden">
        <span className="text-[1.0625rem] font-semibold tracking-tight text-[hsl(var(--ink))]">{question}</span>
        <Plus
          aria-hidden
          className="mt-1 h-5 w-5 flex-shrink-0 text-[hsl(var(--muted-ink))] transition-transform duration-200 group-open:rotate-45"
        />
      </summary>
      <div className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-[hsl(var(--muted-ink))]">{children}</div>
    </details>
  );
}
