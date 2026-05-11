"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Settings, Users, type LucideIcon } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "@orgframe/ui/primitives/utils";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { saveProfilePhoto } from "@/src/features/core/account/components/saveProfilePhoto";

type AccountSidebarProps = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
  orgCount: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/", label: "Home", icon: Home },
  { href: "/profiles", label: "People", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings }
];

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountSidebar({ firstName, lastName, email, avatarUrl, orgCount }: AccountSidebarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email || "there";
  const greeting = `Hi, ${firstName?.trim() || displayName}`;
  const dateLine = now ? formatDate(now) : " ";
  const orgLabel = `${orgCount} ${orgCount === 1 ? "organization" : "organizations"}`;

  return (
    <div className="flex w-[260px] flex-col gap-4 overflow-hidden rounded-card border bg-gradient-to-br from-accent/10 via-surface to-surface px-4 py-5">
      <div className="flex items-center gap-3 text-left">
        <EditableAvatar
          className="shadow-sm"
          name={displayName}
          onSelect={async (result) => {
            await saveProfilePhoto(result);
            router.refresh();
          }}
          priority
          sizePx={56}
          src={avatarUrl}
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{dateLine}</p>
          <h2 className="ui-page-title truncate text-base leading-tight">{greeting}</h2>
          {email ? <p className="truncate text-xs text-text-muted">{email}</p> : null}
        </div>
      </div>

      <nav aria-label="Account" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Button
              className={cn("justify-start", active ? "bg-accent/15 text-text" : null)}
              href={item.href}
              key={item.href}
              size="md"
              variant={active ? "secondary" : "ghost"}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>
    </div>
  );
}
