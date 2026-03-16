"use client";

import { Building2, ChevronDown, Home, LogOut, Monitor, Moon, Plus, Settings2, Sun } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@orgframe/ui/ui/button";
import { CreateOrganizationDialog } from "@orgframe/ui/dashboard/CreateOrganizationDialog";
import { AdaptiveLogo } from "@orgframe/ui/ui/adaptive-logo";
import { IconButton } from "@orgframe/ui/ui/icon-button";
import { NavItem } from "@orgframe/ui/ui/nav-item";
import { Popover } from "@orgframe/ui/ui/popover";
import { ThemeMode, useThemeMode } from "@orgframe/ui/ui/theme-mode";
import { cn } from "@/lib/utils";

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
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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
  const tenantBaseProtocol = useMemo(() => getTenantBaseProtocol(tenantBaseOrigin), [tenantBaseOrigin]);
  const orgLinks = useMemo(() => {
    if (!tenantBaseHost) {
      return new Map(organizations.map((organization) => [organization.orgSlug, `/${organization.orgSlug}`]));
    }

    const protocol = tenantBaseProtocol || getCurrentProtocol();
    return new Map(organizations.map((organization) => [organization.orgSlug, `${protocol}//${organization.orgSlug}.${tenantBaseHost}/`]));
  }, [organizations, tenantBaseHost, tenantBaseProtocol]);
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
        href: "/account",
        label: "Account settings",
        icon: Settings2,
        active: pathname === "/account" || pathname.startsWith("/account/")
      }
    ],
    [homeHref, pathname]
  );
  const { mode, resolvedMode, setMode } = useThemeMode();
  const themeOptions: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: "light", icon: Sun, label: "Light mode" },
    { mode: "dark", icon: Moon, label: "Dark mode" },
    { mode: "auto", icon: Monitor, label: "Auto theme" }
  ];

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(buttonVariants({ size: "md", variant: "ghost" }), "h-10 gap-2 rounded-full border border-border/70 bg-surface px-2 pr-3 shadow-sm")}
        onClick={() => setOpen((prev) => !prev)}
        ref={buttonRef}
        type="button"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`${fullName} profile`} className="h-8 w-8 rounded-full border object-cover" src={avatarUrl} />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-surface-muted text-xs font-semibold text-text">
            {initials}
          </span>
        )}
        <span className="max-w-32 truncate text-sm font-semibold text-text">{fullName}</span>
        <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform duration-200", open ? "rotate-180" : "")} />
      </button>

      <Popover anchorRef={buttonRef} className="w-[22rem] overflow-hidden rounded-[22px] border border-border/70 bg-surface/95 p-0 shadow-floating backdrop-blur-xl" onClose={() => setOpen(false)} open={open}>
        <div className="border-b border-border/70 bg-gradient-to-br from-surface to-surface-muted/45 p-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
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
