import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export interface FeatureGridItem {
  title: string;
  summary: string;
  href?: string;
  icon?: LucideIcon;
}

interface FeatureGridProps {
  items: ReadonlyArray<FeatureGridItem>;
  columns?: 2 | 3 | 4;
}

const columnClass: Record<2 | 3 | 4, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4"
};

export function FeatureGrid({ items, columns = 3 }: FeatureGridProps) {
  return (
    <ul className={`grid grid-cols-1 gap-px rounded-[28px] border border-[hsl(var(--rule))] bg-[hsl(var(--rule))] overflow-hidden ${columnClass[columns]}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const inner = (
          <div className="flex h-full flex-col gap-4 bg-[hsl(var(--paper-2))] p-7 transition-colors hover:bg-[hsl(var(--paper-3))]">
            {Icon ? (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--rule-strong))] text-[hsl(var(--ink))]">
                <Icon aria-hidden className="h-5 w-5" />
              </span>
            ) : null}
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-[hsl(var(--ink))]">{item.title}</h3>
              <p className="text-sm leading-relaxed text-[hsl(var(--muted-ink))]">{item.summary}</p>
            </div>
            {item.href ? (
              <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-[hsl(var(--accent-ink))]">
                Learn more <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
        );
        return (
          <li key={item.title}>
            {item.href ? (
              <Link className="block h-full" href={item.href}>
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
