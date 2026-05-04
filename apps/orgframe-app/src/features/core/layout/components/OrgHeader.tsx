"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Settings } from "lucide-react";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import { Button } from "@orgframe/ui/primitives/button";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { PickerMenu, type PickerMenuItem } from "@orgframe/ui/primitives/picker-menu";
import {
  buildOrgSwitchHref,
  getTenantBaseAuthority,
  getTenantBaseHost,
  getTenantBaseProtocol
} from "@/src/features/core/layout/lib/orgSwitchHref";
import type { OrgNavItem } from "@/src/features/site/types";
import type { OrgAdminNavNode } from "@/src/features/core/navigation/config/adminNav";
import { renderAdminNavNode } from "@/src/features/core/navigation/components/renderAdminNavNode";
import { cn } from "@orgframe/ui/primitives/utils";
import {
  ORG_HEADER_EDITOR_TOOLBAR_SLOT_ID,
  ORG_SITE_EDITOR_STATE_EVENT,
  ORG_SITE_OPEN_EDITOR_EVENT,
  ORG_SITE_OPEN_EDITOR_REQUEST_KEY
} from "@/src/features/site/events";

export type OrgHeaderManageNavItem = OrgAdminNavNode;

export type OrgSwitcherOption = {
  orgSlug: string;
  orgName: string;
  orgIconUrl?: string | null;
  orgLogoUrl?: string | null;
};

type OrgHeaderProps = {
  orgSlug: string;
  orgName: string;
  orgLogoUrl?: string | null;
  canManageOrg: boolean;
  canEditPages: boolean;
  navItems: OrgNavItem[];
  manageNavItems?: OrgHeaderManageNavItem[];
  orgOptions?: OrgSwitcherOption[];
  tenantBaseOrigin?: string | null;
};

function getOrgInitial(orgName: string) {
  return orgName.trim().charAt(0).toUpperCase() || "O";
}

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isActivePrefixPath(pathname: string, href: string) {
  const current = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  return current === normalizedHref || current.startsWith(`${normalizedHref}/`);
}

function isEditablePublicOrgPath(pathname: string, orgBasePath: string) {
  const normalized = normalizePath(pathname);
  const scopedPath =
    normalized === orgBasePath
      ? "/"
      : normalized.startsWith(`${orgBasePath}/`)
        ? normalized.slice(orgBasePath.length) || "/"
        : normalized;

  if (scopedPath === "/") {
    return true;
  }

  if (!scopedPath.startsWith("/")) {
    return false;
  }

  return !scopedPath.startsWith("/manage") && !scopedPath.startsWith("/icon");
}

function navItemHref(item: OrgNavItem, orgSlug: string): string | null {
  if (item.linkType === "internal" && item.pageSlug) {
    return `/${orgSlug}/${item.pageSlug}`;
  }
  if (item.linkType === "external" && item.externalUrl) {
    return item.externalUrl;
  }
  return null;
}

export function OrgHeader({
  orgSlug,
  orgName,
  orgLogoUrl,
  canEditPages,
  canManageOrg,
  navItems,
  manageNavItems = [],
  orgOptions = [],
  tenantBaseOrigin = null
}: OrgHeaderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);

  const switcherOptions = useMemo(() => {
    const current = orgOptions.find((option) => option.orgSlug === orgSlug);
    const others = orgOptions.filter((option) => option.orgSlug !== orgSlug).sort((a, b) => a.orgName.localeCompare(b.orgName));
    return current ? [current, ...others] : orgOptions;
  }, [orgOptions, orgSlug]);
  const hasSwitchableOrgs = switcherOptions.length > 1;
  const tenantBaseHost = useMemo(() => getTenantBaseHost(tenantBaseOrigin), [tenantBaseOrigin]);
  const tenantBaseAuthority = useMemo(() => getTenantBaseAuthority(tenantBaseOrigin), [tenantBaseOrigin]);
  const tenantBaseProtocol = useMemo(() => getTenantBaseProtocol(tenantBaseOrigin), [tenantBaseOrigin]);

  const orgBasePath = `/${orgSlug}`;
  const currentPathname = hasHydrated ? pathname : "";
  const canEditCurrentPage = canEditPages && hasHydrated && isEditablePublicOrgPath(currentPathname, orgBasePath);

  const [isScrolled, setIsScrolled] = useState(false);
  const [isPageContentEditing, setIsPageContentEditing] = useState(false);
  const [isPageEditorInitializing, setIsPageEditorInitializing] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    setManageMenuOpen(false);
  }, [pathname]);

  const openEditorOnPath = useCallback(
    (targetPath: string) => {
      const normalizedTarget = normalizePath(targetPath);
      const normalizedCurrent = normalizePath(currentPathname || pathname);
      setIsPageEditorInitializing(true);

      if (normalizedTarget === normalizedCurrent) {
        window.dispatchEvent(
          new CustomEvent(ORG_SITE_OPEN_EDITOR_EVENT, {
            detail: { pathname: normalizedTarget }
          })
        );
        return;
      }

      sessionStorage.setItem(ORG_SITE_OPEN_EDITOR_REQUEST_KEY, normalizedTarget);
      router.push(normalizedTarget);
    },
    [currentPathname, pathname, router]
  );

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onEditorState = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string; isEditing?: boolean; isInitializing?: boolean }>).detail;

      if (!detail?.pathname || normalizePath(detail.pathname) !== normalizePath(currentPathname || pathname)) {
        return;
      }

      setIsPageContentEditing(Boolean(detail.isEditing));
      setIsPageEditorInitializing(Boolean(detail.isInitializing));
    };

    window.addEventListener(ORG_SITE_EDITOR_STATE_EVENT, onEditorState);
    return () => window.removeEventListener(ORG_SITE_EDITOR_STATE_EVENT, onEditorState);
  }, [currentPathname, pathname]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let rafId = 0;
    const syncHeight = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      const nextHeight = Math.max(0, Math.round(rect?.height ?? 0));
      const nextBottom = Math.max(0, Math.round(rect?.bottom ?? 0));
      document.documentElement.style.setProperty("--org-header-height", `${nextHeight}px`);
      document.documentElement.style.setProperty("--org-header-bottom", `${nextBottom}px`);
    };
    const scheduleSyncHeight = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncHeight();
      });
    };

    syncHeight();
    scheduleSyncHeight();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && rootRef.current) {
      observer = new ResizeObserver(() => scheduleSyncHeight());
      observer.observe(rootRef.current);
    }
    window.addEventListener("resize", scheduleSyncHeight);
    window.addEventListener("scroll", scheduleSyncHeight, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleSyncHeight);
      window.removeEventListener("scroll", scheduleSyncHeight);
      document.documentElement.style.setProperty("--org-header-height", "0px");
      document.documentElement.style.setProperty("--org-header-bottom", "0px");
    };
  }, []);

  const topLevelNavItems = navItems.filter((item) => item.parentId === null && item.isVisible);
  const manageHref = `/${orgSlug}/manage`;

  return (
    <div className="w-full min-w-0" ref={rootRef}>
      <div className={cn("rounded-card border bg-surface shadow-floating transition-shadow", isScrolled ? "shadow-lg" : "")}>
        <div className="flex min-h-[64px] items-center gap-3 pb-2.5 pl-4 pr-2.5 pt-2.5 md:pb-4 md:pl-6 md:pr-4 md:pt-4">
          <div className="flex shrink-0 items-center gap-1 self-stretch">
            <Link className="flex h-full min-w-0 items-center gap-3 leading-none" href={`/${orgSlug}`} prefetch>
              <span className="flex h-7 max-w-[220px] shrink-0 items-center leading-none md:h-8">
                {orgLogoUrl ? (
                  <AdaptiveLogo
                    alt={`${orgName} logo`}
                    className="block h-full w-auto max-w-full align-middle object-contain object-left"
                    src={orgLogoUrl}
                  />
                ) : (
                  <span className="inline-flex h-full items-center text-sm font-semibold text-text-muted">{getOrgInitial(orgName)}</span>
                )}
              </span>

              {!orgLogoUrl ? <span className="hidden max-w-[180px] truncate text-sm font-semibold text-text sm:inline">{orgName}</span> : null}
            </Link>

            {hasSwitchableOrgs ? (
              <PickerMenu
                ariaLabel="Switch organization"
                placement="bottom-start"
                widthClassName="w-[18rem] max-w-[calc(100vw-1.5rem)]"
                renderTrigger={({ ref, onClick, open }) => (
                  <Button
                    iconOnly
                    aria-expanded={open}
                    aria-haspopup="menu"
                    aria-label="Switch organization"
                    onClick={onClick}
                    ref={ref}
                  >
                    <ChevronDown className={cn("transition-transform", open ? "rotate-180" : "")} />
                  </Button>
                )}
                items={switcherOptions.map<PickerMenuItem>((option) => {
                  const isCurrent = option.orgSlug === orgSlug;
                  const href = isCurrent
                    ? `/${option.orgSlug}`
                    : buildOrgSwitchHref({
                        targetOrgSlug: option.orgSlug,
                        pathname: currentPathname || pathname,
                        currentOrgSlug: orgSlug,
                        tenantBaseHost,
                        tenantBaseAuthority,
                        tenantBaseProtocol,
                        currentProtocol: hasHydrated ? window.location.protocol : "https:"
                      });
                  const logoSrc = option.orgIconUrl ?? option.orgLogoUrl ?? null;
                  return {
                    key: option.orgSlug,
                    label: option.orgName,
                    href,
                    iconUrl: logoSrc,
                    iconAlt: `${option.orgName} icon`,
                    iconFallback: (
                      <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-text-muted">
                        {getOrgInitial(option.orgName)}
                      </span>
                    ),
                    active: isCurrent
                  };
                })}
              />
            ) : null}
          </div>

          {!isPageContentEditing && topLevelNavItems.length > 0 ? (
            <nav aria-label="Organization pages" className="hidden min-w-0 flex-1 md:block">
              <div className="flex min-w-0 items-center justify-end gap-1 overflow-x-auto">
                {topLevelNavItems.map((item) => {
                  const href = navItemHref(item, orgSlug);
                  if (!href) return null;
                  return (
                    <NavItem
                      active={isActivePrefixPath(currentPathname, href)}
                      href={href}
                      key={item.id}
                      target={item.openInNewTab ? "_blank" : undefined}
                      variant="header"
                    >
                      {item.label}
                    </NavItem>
                  );
                })}
              </div>
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          {!isPageContentEditing && topLevelNavItems.length > 0 && canManageOrg ? (
            <div aria-hidden className="hidden h-6 w-px shrink-0 bg-border md:block" />
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            {!isPageContentEditing && canEditCurrentPage ? (
              <Button
                onClick={() => openEditorOnPath(currentPathname || pathname)}
                size="md"
                type="button"
                variant="secondary"
                loading={isPageEditorInitializing}
              >
                <Pencil />
                Edit Page
              </Button>
            ) : null}

            {canEditPages && isPageContentEditing ? (
              <div
                className="flex flex-wrap items-center gap-2"
                id={ORG_HEADER_EDITOR_TOOLBAR_SLOT_ID}
              />
            ) : null}

            {!isPageContentEditing && canManageOrg ? (
              <Button
                href={manageHref}
                size="md"
                variant="secondary"
                dropdownOpen={manageMenuOpen}
                onDropdownOpenChange={setManageMenuOpen}
                dropdown={manageNavItems.map((node) =>
                  renderAdminNavNode(node, {
                    pathname: currentPathname,
                    variant: "dropdown",
                    size: "sm",
                    dropdownPlacement: "bottom-end"
                  })
                )}
              >
                <Settings className="h-4 w-4" />
                Manage
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
