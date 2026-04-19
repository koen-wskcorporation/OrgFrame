"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Inbox, Settings, Users } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { saveProfilePhoto } from "@/src/features/core/account/components/saveProfilePhoto";

type DashboardHeaderProps = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
  orgCount: number;
};

function greetingFor(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

export function DashboardHeader({ firstName, lastName, email, avatarUrl, orgCount }: DashboardHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email || "there";
  const greeting = now ? `${greetingFor(now.getHours())}, ${firstName?.trim() || displayName}` : `Welcome back, ${firstName?.trim() || displayName}`;
  const dateLine = now ? formatDate(now) : "\u00A0";

  const orgLabel = `${orgCount} ${orgCount === 1 ? "organization" : "organizations"}`;

  return (
    <div className="relative overflow-hidden rounded-card border bg-gradient-to-br from-accent/10 via-surface to-surface px-5 py-6 md:px-7 md:py-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4 md:gap-5">
          <EditableAvatar
            className="shadow-sm ring-2 ring-surface"
            name={displayName}
            onSelect={async (result) => {
              await saveProfilePhoto(result);
              router.refresh();
            }}
            priority
            sizePx={72}
            src={avatarUrl}
          />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{dateLine}</p>
            <h1 className="ui-page-title truncate">{greeting}</h1>
            <p className="max-w-[60ch] truncate text-sm text-text-muted">
              {orgLabel}
              {email ? <span className="mx-2 text-border">•</span> : null}
              {email}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button href="/" size="md" variant="secondary">
            <Home className="h-4 w-4" />
            Home
          </Button>
          <Button href="/profiles" size="md" variant="secondary">
            <Users className="h-4 w-4" />
            Profiles
          </Button>
          <Button href="/inbox" size="md" variant="secondary">
            <Inbox className="h-4 w-4" />
            Inbox
          </Button>
          <Button href="/settings" size="md" variant="secondary">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
