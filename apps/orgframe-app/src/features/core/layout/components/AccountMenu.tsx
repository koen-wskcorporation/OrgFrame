"use client";

import { Bell, ChevronDown, Home, LogOut, Monitor, Moon, Settings2, Sun, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { buttonVariants } from "@orgframe/ui/primitives/button";
import { IconToggleGroup } from "@orgframe/ui/primitives/icon-toggle-group";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { Popover } from "@orgframe/ui/primitives/popover";
import { ThemeMode, useThemeMode } from "@orgframe/ui/primitives/theme-mode";
import { cn } from "@orgframe/ui/primitives/utils";

type ProfileRelationship = "self" | "guardian" | "delegated_manager";

type AccountMenuProfile = {
  id: string;
  displayName: string;
  relationshipType: ProfileRelationship;
};

type AccountMenuProps = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  profiles?: AccountMenuProfile[];
  homeHref?: string;
  signOutAction: (formData: FormData) => Promise<void>;
  tenantBaseOrigin?: string | null;
};

const RELATIONSHIP_LABELS: Record<ProfileRelationship, string> = {
  self: "You",
  guardian: "Guardian",
  delegated_manager: "Manager"
};

const RELATIONSHIP_TAG_CLASSES: Record<ProfileRelationship, string> = {
  self: "border-accent/40 bg-accent/10 text-text",
  guardian: "border-border bg-surface-muted text-text-muted",
  delegated_manager: "border-border bg-surface-muted text-text-muted"
};

type HeaderNotification = {
  id: string;
  orgId: string;
  orgName: string | null;
  orgSlug: string | null;
  itemType: string;
  title: string;
  body: string | null;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

function formatRelativeTime(isoValue: string) {
  const createdAt = new Date(isoValue);
  if (Number.isNaN(createdAt.getTime())) {
    return "Just now";
  }

  const deltaSeconds = Math.round((createdAt.getTime() - Date.now()) / 1000);
  const ranges = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 }
  ] as const;

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const range of ranges) {
    if (Math.abs(deltaSeconds) >= range.seconds || range.unit === "second") {
      const value = Math.round(deltaSeconds / range.seconds);
      return formatter.format(value, range.unit);
    }
  }

  return "Just now";
}

function initialsFromName(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const first = firstName?.trim().charAt(0) ?? "";
  const last = lastName?.trim().charAt(0) ?? "";

  if (first || last) {
    return `${first}${last}`.toUpperCase();
  }

  return (email?.trim().charAt(0) ?? "A").toUpperCase();
}

function toTenantBaseHref(pathname: string, tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) {
    return pathname;
  }

  const base = tenantBaseOrigin.replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

export function AccountMenu({
  email,
  firstName,
  lastName,
  avatarUrl,
  profiles = [],
  homeHref = "/",
  signOutAction,
  tenantBaseOrigin = null
}: AccountMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);

  const fullName = useMemo(() => {
    const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean) as string[];

    if (parts.length) {
      return parts.join(" ");
    }

    return "Account";
  }, [firstName, lastName]);
  const menuItems = useMemo(
    () => [
      {
        href: homeHref,
        label: "Home",
        icon: Home,
        active: pathname === "/" && homeHref === "/"
      },
      {
        href: toTenantBaseHref("/profiles", tenantBaseOrigin),
        label: "People",
        icon: Users,
        active: pathname === "/profiles" || pathname.startsWith("/profiles/")
      },
      {
        href: toTenantBaseHref("/settings", tenantBaseOrigin),
        label: "Settings",
        icon: Settings2,
        active: pathname === "/settings" || pathname.startsWith("/settings/")
      }
    ],
    [homeHref, pathname, tenantBaseOrigin]
  );
  const { mode, setMode } = useThemeMode();
  const themeOptions: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: "light", icon: Sun, label: "Light mode" },
    { mode: "dark", icon: Moon, label: "Dark mode" },
    { mode: "auto", icon: Monitor, label: "Auto theme" }
  ];

  useEffect(() => {
    const controller = new AbortController();

    setNotificationsLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/account/notifications", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          setNotifications([]);
          setUnreadCount(0);
          setNotificationsLoading(false);
          return;
        }

        const payload = (await response.json()) as {
          authenticated: boolean;
          unreadCount?: number;
          notifications?: HeaderNotification[];
        };

        setNotifications(payload.notifications ?? []);
        setUnreadCount(payload.unreadCount ?? 0);
        setNotificationsLoading(false);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [pathname]);

  return (
    <div className="relative flex items-center gap-2">
      <button
        aria-expanded={notificationsOpen}
        aria-haspopup="menu"
        className={cn(
          buttonVariants({ size: "md", variant: "ghost" }),
          "relative h-10 w-10 rounded-full border border-border/70 bg-surface p-0 text-text shadow-sm hover:bg-surface-muted"
        )}
        onClick={() => {
          setNotificationsOpen((prev) => !prev);
          setOpen(false);
        }}
        ref={notificationsButtonRef}
        type="button"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <Popover
        anchorRef={notificationsButtonRef}
        className="w-[25rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[22px] border border-border/70 bg-surface/95 p-0 shadow-floating backdrop-blur-xl"
        onClose={() => setNotificationsOpen(false)}
        open={notificationsOpen}
      >
        <div className="border-b border-border/70 p-4">
          <p className="text-sm font-semibold text-text">Notifications</p>
          <p className="text-xs text-text-muted">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
        </div>

        <div className="max-h-[22rem] space-y-1 overflow-y-auto p-2.5">
          {notificationsLoading ? <p className="px-2 py-6 text-center text-sm text-text-muted">Loading notifications...</p> : null}
          {!notificationsLoading && notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-text-muted">No notifications yet.</p>
          ) : null}
          {!notificationsLoading
            ? notifications.map((notification) => {
                const href = notification.href
                  ? notification.href.startsWith("/")
                    ? toTenantBaseHref(notification.href, tenantBaseOrigin)
                    : notification.href
                  : null;

                return (
                  <NavItem
                    href={href ?? undefined}
                    key={notification.id}
                    onClick={() => setNotificationsOpen(false)}
                    size="md"
                    variant="sidebar"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <span
                        aria-hidden
                        className={cn("mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full", notification.isRead ? "bg-border" : "bg-accent")}
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-1 text-left text-sm font-semibold text-text">{notification.title}</span>
                        {notification.body ? <span className="line-clamp-2 block text-left text-xs text-text-muted">{notification.body}</span> : null}
                        <span className="mt-0.5 block text-left text-[11px] text-text-muted">
                          {notification.orgName ? `${notification.orgName} • ` : ""}
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </span>
                    </span>
                  </NavItem>
                );
              })
            : null}
        </div>
      </Popover>

      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          buttonVariants({ size: "md", variant: "ghost" }),
          "h-11 gap-2 rounded-full border border-border/70 bg-gradient-to-b from-surface to-surface-muted/35 px-2 pr-3 shadow-sm hover:from-surface-muted/70 hover:to-surface-muted/40"
        )}
        onClick={() => {
          setOpen((prev) => !prev);
          setNotificationsOpen(false);
        }}
        ref={buttonRef}
        type="button"
      >
        <Avatar alt={`${fullName} profile`} name={fullName} priority sizePx={32} src={avatarUrl} />
        <span className="min-w-0 text-left">
          <span className="block max-w-40 truncate text-sm font-semibold text-text">{fullName}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform duration-200", open ? "rotate-180" : "")} />
      </button>

      <Popover
        anchorRef={buttonRef}
        className="w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[22px] border border-border/70 bg-surface/95 p-0 shadow-floating backdrop-blur-xl"
        onClose={() => setOpen(false)}
        open={open}
      >
        <div className="border-b border-border/70 px-4 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <Avatar alt={`${fullName} profile`} name={fullName} sizePx={52} src={avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-text">{fullName}</p>
              {email ? <p className="truncate text-xs text-text-muted">{email}</p> : null}
            </div>
          </div>
        </div>

        {profiles.length > 0 ? (
          <div className="border-b border-border/70 p-2.5">
            <p className="px-2.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">People</p>
            <ul className="space-y-0.5">
              {profiles.map((profile) => (
                <li
                  className="flex items-center gap-2.5 rounded-control px-2.5 py-2"
                  key={profile.id}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-text">
                    {initialsFromName(profile.displayName, null, null)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{profile.displayName}</span>
                  <span className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    RELATIONSHIP_TAG_CLASSES[profile.relationshipType]
                  )}>
                    {RELATIONSHIP_LABELS[profile.relationshipType]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1 p-2.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavItem
                active={item.active}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                size="md"
                variant="sidebar"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-text-muted" />
                  {item.label}
                </span>
              </NavItem>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-surface-muted/30 px-3 py-2.5">
          <form
            action={signOutAction}
            onSubmit={() => {
              setOpen(false);
            }}
          >
            <button
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>

          <IconToggleGroup<ThemeMode>
            ariaLabel="Theme mode"
            onChange={setMode}
            options={themeOptions.map((option) => ({
              value: option.mode,
              icon: option.icon,
              label: option.label
            }))}
            value={mode}
          />
        </div>
      </Popover>
    </div>
  );
}
