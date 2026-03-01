import Link from "next/link";
import { cn } from "@/lib/utils";

type ProgramPageTabsProps = {
  orgSlug: string;
  programId: string;
  active: "structure" | "schedule" | "registration";
};

export function ProgramPageTabs({ orgSlug, programId, active }: ProgramPageTabsProps) {
  const items = [
    {
      key: "structure",
      label: "Structure",
      href: `/${orgSlug}/tools/programs/${programId}/structure`
    },
    {
      key: "schedule",
      label: "Schedule",
      href: `/${orgSlug}/tools/programs/${programId}/schedule`
    },
    {
      key: "registration",
      label: "Registration",
      href: `/${orgSlug}/tools/programs/${programId}/registration`
    }
  ] as const;

  return (
    <nav aria-label="Program pages" className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-stretch">
        {items.map((item) => {
          const isActive = active === item.key;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-[60px] min-w-0 flex-1 flex-col items-stretch justify-between px-0 pb-0 pt-0 text-sm font-semibold transition-colors",
                isActive ? "text-text" : "text-text-muted hover:text-text"
              )}
              href={item.href}
              key={item.key}
            >
              <span className="flex flex-1 items-center justify-center px-3 text-center">{item.label}</span>
              <span
                aria-hidden
                className="block h-1 w-full rounded-full"
                style={{
                  backgroundColor: isActive ? "hsl(var(--accent))" : "transparent"
                }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
