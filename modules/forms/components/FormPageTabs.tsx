import Link from "next/link";
import { cn } from "@/lib/utils";

type FormPageTabsProps = {
  orgSlug: string;
  formId: string;
  active: "builder" | "submissions";
};

export function FormPageTabs({ orgSlug, formId, active }: FormPageTabsProps) {
  const items = [
    {
      key: "builder",
      label: "Builder",
      href: `/${orgSlug}/tools/forms/${formId}/editor`
    },
    {
      key: "submissions",
      label: "Submissions",
      href: `/${orgSlug}/tools/forms/${formId}/submissions`
    }
  ] as const;

  return (
    <nav aria-label="Form pages" className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
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
              prefetch={false}
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
