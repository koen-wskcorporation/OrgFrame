import Link from "next/link";
import { cn } from "./utils";

export type WorkspaceSectionNavItem<T extends string> = {
  key: T;
  label: string;
  description: string;
  href: string;
  prefetch?: boolean;
};

type WorkspaceSectionNavProps<T extends string> = {
  ariaLabel: string;
  active: T;
  items: ReadonlyArray<WorkspaceSectionNavItem<T>>;
  className?: string;
};

export function WorkspaceSectionNav<T extends string>({ ariaLabel, active, items, className }: WorkspaceSectionNavProps<T>) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className="ws-tabs flex snap-x snap-mandatory gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = active === item.key;

          return (
            <li className="min-w-[196px] shrink-0 snap-start md:min-w-0 md:flex-1" key={item.key}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "ws-tab group flex h-full flex-col rounded-control border px-3.5 py-3 transition-colors",
                  isActive
                    ? "border-border/80 bg-surface text-text-muted hover:bg-surface-muted/35 hover:text-text"
                    : "border-border bg-surface-muted/65 text-text shadow-sm"
                )}
                href={item.href}
                prefetch={item.prefetch}
              >
                <span className={cn("truncate text-sm font-semibold", isActive ? "text-accent" : "text-text-muted")}>{item.label}</span>
                <span className="ws-tab-desc mt-1.5 line-clamp-1 text-xs text-text-muted">{item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
