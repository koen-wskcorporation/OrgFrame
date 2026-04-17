"use client";

import { Bell, Building2, ChevronDown, Home, LogOut, Monitor, Moon, Plus, Settings2, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@orgframe/ui/primitives/button";
import { CreateOrganizationDialog } from "@/src/features/core/dashboard/components/CreateOrganizationDialog";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import { IconButton } from "@orgframe/ui/primitives/icon-button";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { Popover } from "@orgframe/ui/primitives/popover";
import { ThemeMode, useThemeMode } from "@orgframe/ui/primitives/theme-mode";
import { cn } from "@orgframe/ui/primitives/utils";

type AccountMenuProps = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  organizations?: {
    orgId: string;
    orgName: string;
    orgSlug: string;
    iconUrl: string | null;
  }[];
  currentOrgSlug?: string | null;
  homeHref?: string;
  signOutAction: (formData: FormData) => Promise<void>;
  tenantBaseOrigin?: string | null;
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

function getTenantBaseHost(tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) {
    return "";
  }

  try {
    return new URL(tenantBaseOrigin).hostname;
  } catch {
    return "";
  }
}

function getTenantBaseAuthority(tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) {
    return "";
  }

  try {
    return new URL(tenantBaseOrigin).host;
  } catch {
    return "";
  }
}

function getTenantBaseProtocol(tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) {
    return "";
  }

  try {
    return new URL(tenantBaseOrigin).protocol;
  } catch {
    return "";
  }
}

function getCurrentHost() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname.toLowerCase();
}

function getCurrentProtocol() {
  if (typeof window === "undefined") {
    return "https:";
  }

  return window.location.protocol;
}

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function toOrgPathSuffix(pathname: string, currentOrgSlug: string, hasTenantBaseHost: boolean) {
  const normalizedPath = normalizePathname(pathname);

  if (normalizedPath === "/") {
    return "/";
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }

  if (currentOrgSlug && segments[0] === currentOrgSlug) {
    return segments.length === 1 ? "/" : `/${segments.slice(1).join("/")}`;
  }

  if (!hasTenantBaseHost) {
    return "/";
  }

  const first = segments[0]?.toLowerCase() ?? "";
  if (first === "account" || first === "auth" || first === "api") {
    return "/";
  }

  return `/${segments.join("/")}`;
}

function collapseToClosestOrgPath(pathSuffix: string) {
  const normalizedSuffix = normalizePathname(pathSuffix);
  if (normalizedSuffix === "/") {
    return "/";
  }

  const segments = normalizedSuffix.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }

  const first = segments[0]?.toLowerCase();
  const second = segments[1]?.toLowerCase();

  const collectionTools = new Set(["facility", "facilities", "forms", "programs"]);
  if ((first === "tools" || first === "manage") && second && collectionTools.has(second) && segments.length >= 3) {
    return `/${segments.slice(0, 2).join("/")}`;
  }

  const publicCollections = new Set(["calendar", "events", "programs", "register"]);
  if (first && publicCollections.has(first) && segments.length >= 2) {
    return `/${first}`;
  }

  return normalizedSuffix;
}

function buildOrgSwitchHref(
  targetOrgSlug: string,
  pathname: string,
  currentOrgSlug: string,
  tenantBaseHost: string,
  tenantBaseAuthority: string,
  tenantBaseProtocol: string
) {
  const protocol = tenantBaseProtocol || getCurrentProtocol();
  const pathSuffix = collapseToClosestOrgPath(toOrgPathSuffix(pathname, currentOrgSlug, Boolean(tenantBaseHost)));

  if (tenantBaseAuthority) {
    return `${protocol}//${targetOrgSlug}.${tenantBaseAuthority}${pathSuffix}`;
  }

  if (pathSuffix === "/") {
    return `/${targetOrgSlug}`;
  }

  return `/${targetOrgSlug}${pathSuffix}`;
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
  organizations = [],
  currentOrgSlug: currentOrgSlugProp = null,
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

  const accountLabel = email ?? "Signed-in account";
  const fullName = useMemo(() => {
    const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean) as string[];

    if (parts.length) {
      return parts.join(" ");
    }

    return "Account";
  }, [firstName, lastName]);
  const initials = initialsFromName(firstName, lastName, email);
  const tenantBaseHost = useMemo(() => getTenantBaseHost(tenantBaseOrigin), [tenantBaseOrigin]);
  const tenantBaseAuthority = useMemo(() => getTenantBaseAuthority(tenantBaseOrigin), [tenantBaseOrigin]);
  const tenantBaseProtocol = useMemo(() => getTenantBaseProtocol(tenantBaseOrigin), [tenantBaseOrigin]);
  const currentOrgSlug = useMemo(() => {
    if (currentOrgSlugProp) {
      return currentOrgSlugProp;
    }

    const currentHost = getCurrentHost();
    if (tenantBaseHost && currentHost.endsWith(`.${tenantBaseHost}`)) {
      return currentHost.slice(0, -(tenantBaseHost.length + 1));
    }

    const [_, slug] = pathname.split("/");
    return slug ?? "";
  }, [currentOrgSlugProp, pathname, tenantBaseHost]);
  const orgLinks = useMemo(() => {
    return new Map(
      organizations.map((organization) => [
        organization.orgSlug,
        buildOrgSwitchHref(organization.orgSlug, pathname, currentOrgSlug, tenantBaseHost, tenantBaseAuthority, tenantBaseProtocol)
      ])
    );
  }, [organizations, pathname, currentOrgSlug, tenantBaseHost, tenantBaseAuthority, tenantBaseProtocol]);
  const orderedOrganizations = useMemo(() => {
    return [...organizations].sort((a, b) => {
      if (a.orgSlug === currentOrgSlug) {
        return -1;
      }
      if (b.orgSlug === currentOrgSlug) {
        return 1;
      }
      return a.orgName.localeCompare(b.orgName);
    });
  }, [currentOrgSlug, organizations]);
  const menuItems = useMemo(
    () => [
      {
        href: homeHref,
        label: "Home",
        icon: Home,
        active: pathname === "/" && homeHref === "/"
      },
      {
        href: toTenantBaseHref("/account", tenantBaseOrigin),
        label: "Account settings",
        icon: Settings2,
        active: pathname === "/account" || pathname.startsWith("/account/")
      }
    ],
    [homeHref, pathname, tenantBaseOrigin]
  );
  const { mode, resolvedMode, setMode } = useThemeMode();
  const themeOptions: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: "light", icon: Sun, label: "Light mode" },
    { mode: "dark", icon: Moon, label: "Dark mode" },
    { mode: "auto", icon: Monitor, label: "Auto theme" }
  ];
  const secondaryAccountLabel = accountLabel;

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
        className="w-[25rem] overflow-hidden rounded-[22px] border border-border/70 bg-surface/95 p-0 shadow-floating backdrop-blur-xl"
        onClose={() => setNotificationsOpen(false)}
        open={notificationsOpen}
      >
        <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-br from-surface to-surface-muted/35 p-4">
          <div>
            <p className="text-sm font-semibold text-text">Notifications</p>
            <p className="text-xs text-text-muted">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
          </div>
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
        {avatarUrl ? (
          <img alt={`${fullName} profile`} className="h-8 w-8 rounded-full border object-cover" src={avatarUrl} />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-surface-muted text-xs font-semibold text-text">
            {initials}
          </span>
        )}
        <span className="min-w-0 text-left">
          <span className="block max-w-40 truncate text-sm font-semibold text-text">{fullName}</span>
          <span className="block max-w-44 truncate text-[11px] text-text-muted">{secondaryAccountLabel}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform duration-200", open ? "rotate-180" : "")} />
      </button>

      <Popover anchorRef={buttonRef} className="w-[22rem] overflow-hidden rounded-[22px] border border-border/70 bg-surface/95 p-0 shadow-floating backdrop-blur-xl" onClose={() => setOpen(false)} open={open}>
        <div className="border-b border-border/70 bg-gradient-to-br from-surface to-surface-muted/45 p-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img alt={`${fullName} profile`} className="h-11 w-11 rounded-full border object-cover" src={avatarUrl} />
            ) : (
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border bg-surface-muted text-sm font-semibold text-text">{initials}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{fullName}</p>
              <p className="truncate text-xs text-text-muted">{accountLabel}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 p-2.5">
          <CreateOrganizationDialog
            renderTrigger={({ openDialog }) => (
              <div className="space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavItem
                      accentWhenActive
                      active={item.active}
                      href={item.href}
                      key={item.href}
                      onClick={() => setOpen(false)}
                      role="menuitem"
                      size="md"
                      variant="sidebar"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-text-muted" />
                        {item.label}
                      </span>
                    </NavItem>
                  );
                })}
                <NavItem
                  onClick={() => {
                    setOpen(false);
                    openDialog();
                  }}
                  role="menuitem"
                  size="md"
                  variant="sidebar"
                >
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-text-muted" />
                    Create organization
                  </span>
                </NavItem>
              </div>
            )}
          />

          {orderedOrganizations.length > 1 ? (
            <>
              <div aria-hidden className="my-1 h-px bg-border/70" />
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <Building2 className="h-3.5 w-3.5" />
                Switch Organization
              </p>
              {orderedOrganizations.map((organization) => (
                <NavItem
                  accentWhenActive
                  active={organization.orgSlug === currentOrgSlug}
                  href={orgLinks.get(organization.orgSlug) ?? `/${organization.orgSlug}`}
                  key={organization.orgId}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  size="md"
                  variant="sidebar"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {organization.iconUrl ? (
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
                        <AdaptiveLogo
                          alt={`${organization.orgName} icon`}
                          className="h-full w-full object-contain object-center"
                          src={organization.iconUrl}
                          svgClassName="block h-full w-full object-contain object-center"
                        />
                      </span>
                    ) : (
                      <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border bg-surface-muted px-1.5 text-[10px] font-semibold text-text-muted">
                        {initialsFromName(organization.orgName, null, null)}
                      </span>
                    )}
                    <span className="truncate">{organization.orgName}</span>
                  </span>
                </NavItem>
              ))}
            </>
          ) : null}

          <div aria-hidden className="my-1 h-px bg-border/70" />
          <div className="flex items-end justify-between gap-2 px-1">
            <form
              action={signOutAction}
              onSubmit={() => {
                setOpen(false);
              }}
            >
              <NavItem className="text-destructive" role="menuitem" size="md" type="submit" variant="header">
                <span className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </span>
              </NavItem>
            </form>

            <div aria-label="Theme mode" className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface p-1" role="radiogroup">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = mode === option.mode;
                  return (
                    <IconButton
                      aria-checked={isActive}
                      className={cn(
                        "h-8 w-8 border",
                        isActive ? "border-border/80 bg-surface-muted text-text shadow-sm" : "border-transparent text-text-muted hover:border-border/60"
                      )}
                      icon={<Icon />}
                      key={option.mode}
                      label={option.label}
                      onClick={() => setMode(option.mode)}
                      role="radio"
                      title={option.label}
                    />
                  );
                })}
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}
