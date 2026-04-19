"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  Plus,
  Pencil,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { ProgramHeaderBar } from "@/src/features/core/layout/components/ProgramHeaderBar";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import { Button } from "@orgframe/ui/primitives/button";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { getOrgAdminNavItems, type OrgAdminNavIcon } from "@/src/features/core/navigation/config/adminNav";
import { ORG_ADMIN_ICON_MAP } from "@/src/features/core/navigation/config/iconRegistry";
import type { OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import type { OrgToolAvailability } from "@/src/shared/org/features";
import { cn } from "@orgframe/ui/primitives/utils";
import {
  ORG_SITE_EDITOR_STATE_EVENT,
  ORG_SITE_OPEN_BLOCK_LIBRARY_EVENT,
  ORG_SITE_OPEN_EDITOR_EVENT,
  ORG_SITE_OPEN_EDITOR_REQUEST_KEY,
  ORG_SITE_SET_EDITOR_EVENT
} from "@/src/features/site/events";
import type { OrgManagePage, ResolvedOrgSiteStructureItemNode } from "@/src/features/site/types";

type OrgHeaderProps = {
  orgSlug: string;
  orgName: string;
  orgLogoUrl?: string | null;
  governingBodyLogoUrl?: string | null;
  governingBodyName?: string | null;
  canManageOrg: boolean;
  canEditPages: boolean;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
  pages: OrgManagePage[];
  resolvedSiteStructure: ResolvedOrgSiteStructureItemNode[];
};

type HeaderMenuNode = {
  item: {
    id: string;
    label: string;
  };
  href: string | null;
  rel: string | undefined;
  target: string | undefined;
  isActive: boolean;
  children: HeaderMenuNode[];
};

const toolsNavIconMap: Record<OrgAdminNavIcon, LucideIcon> = ORG_ADMIN_ICON_MAP;

function getOrgInitial(orgName: string) {
  return orgName.trim().charAt(0).toUpperCase() || "O";
}

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function pageHref(orgSlug: string, pageSlug: string) {
  return pageSlug === "home" ? `/${orgSlug}` : `/${orgSlug}/${pageSlug}`;
}

function toOrgScopedHref(orgSlug: string, href: string | null | undefined) {
  if (!href) {
    return null;
  }

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  const prefix = `/${orgSlug}`;
  if (href === prefix) {
    return "/";
  }

  if (href.startsWith(`${prefix}/`)) {
    const stripped = href.slice(prefix.length);
    return stripped || "/";
  }

  return href;
}

function isActivePath(pathname: string, href: string) {
  const current = normalizePath(pathname);
  const normalizedHref = normalizePath(href);

  if (normalizedHref === `/${pathname.split("/")[1]}`) {
    return current === normalizedHref;
  }

  return current === normalizedHref;
}

function isActivePrefixPath(pathname: string, href: string) {
  const current = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  return current === normalizedHref || current.startsWith(`${normalizedHref}/`);
}

function isEditablePublicOrgPath(pathname: string, orgBasePath: string) {
  const normalized = normalizePath(pathname);
  const scopedPath =
    normalized === orgBasePath ? "/" : normalized.startsWith(`${orgBasePath}/`) ? normalized.slice(orgBasePath.length) || "/" : normalized;

  if (scopedPath === "/") {
    return true;
  }

  if (!scopedPath.startsWith("/")) {
    return false;
  }

  return !scopedPath.startsWith("/manage") && !scopedPath.startsWith("/tools") && !scopedPath.startsWith("/icon");
}

function sortedPages(pages: OrgManagePage[]) {
  return [...pages].sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt));
}

function buildResolvedHeaderMenuNodes({
  nodes,
  orgSlug,
  currentPathname,
  hasHydrated
}: {
  nodes: ResolvedOrgSiteStructureItemNode[];
  orgSlug: string;
  currentPathname: string;
  hasHydrated: boolean;
}): HeaderMenuNode[] {
  const visit = (entries: ResolvedOrgSiteStructureItemNode[]): HeaderMenuNode[] => {
    const rendered: HeaderMenuNode[] = [];

    for (const entry of entries) {
      if (!entry.isVisible) {
        continue;
      }

      const children = visit(entry.children);
      const href = toOrgScopedHref(orgSlug, entry.href);
      const rel = entry.rel ?? undefined;
      const target = entry.target ?? undefined;
      const isActive = href && hasHydrated ? isActivePath(currentPathname, href) : false;
      const childActive = children.some((child) => child.isActive);

      rendered.push({
        item: {
          id: entry.id,
          label: entry.title
        },
        href,
        rel,
        target,
        isActive: Boolean(isActive || childActive),
        children
      });
    }

    return rendered;
  };

  return visit(nodes);
}

function buildFallbackHeaderMenuNodes({
  pages,
  orgSlug,
  currentPathname,
  hasHydrated
}: {
  pages: OrgManagePage[];
  orgSlug: string;
  currentPathname: string;
  hasHydrated: boolean;
}): HeaderMenuNode[] {
  return sortedPages(pages).map((page) => {
    const href = toOrgScopedHref(orgSlug, pageHref(orgSlug, page.slug)) ?? "/";
    const isActive = hasHydrated ? isActivePath(currentPathname, href) : false;

    return {
      item: {
        id: `page:${page.id}`,
        label: page.title
      },
      href,
      rel: undefined,
      target: undefined,
      isActive,
      children: []
    };
  });
}

export function OrgHeader({
  orgSlug,
  orgName,
  orgLogoUrl,
  canManageOrg,
  canEditPages,
  capabilities,
  toolAvailability,
  pages,
  resolvedSiteStructure
}: OrgHeaderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);

  const orgBasePath = `/${orgSlug}`;
  const currentPathname = hasHydrated ? pathname : "";
  const canEditCurrentPage = canEditPages && hasHydrated && isEditablePublicOrgPath(currentPathname, orgBasePath);

  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [expandedToolsParents, setExpandedToolsParents] = useState<Record<string, boolean>>({});
  const [isScrolled, setIsScrolled] = useState(false);

  const [isPageContentEditing, setIsPageContentEditing] = useState(false);
  const [isPageEditorInitializing, setIsPageEditorInitializing] = useState(false);
  const [openHeaderDropdownId, setOpenHeaderDropdownId] = useState<string | null>(null);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const toolsNavItems = useMemo(() => getOrgAdminNavItems(orgSlug, { capabilities, toolAvailability }), [capabilities, orgSlug, toolAvailability]);
  const toolsNavTopLevelItems = useMemo(() => toolsNavItems.filter((item) => !item.parentKey), [toolsNavItems]);
  const toolsNavChildrenByParent = useMemo(() => {
    const map = new Map<string, typeof toolsNavItems>();

    for (const item of toolsNavItems) {
      if (!item.parentKey) {
        continue;
      }

      const current = map.get(item.parentKey) ?? [];
      current.push(item);
      map.set(item.parentKey, current);
    }

    return map;
  }, [toolsNavItems]);

  const structuredHeaderMenuNodes = useMemo(
    () => buildResolvedHeaderMenuNodes({ nodes: resolvedSiteStructure, orgSlug, currentPathname, hasHydrated }),
    [currentPathname, hasHydrated, orgSlug, resolvedSiteStructure]
  );
  const fallbackHeaderMenuNodes = useMemo(
    () =>
      buildFallbackHeaderMenuNodes({
        pages,
        orgSlug,
        currentPathname,
        hasHydrated
      }),
    [currentPathname, hasHydrated, orgSlug, pages]
  );
  const headerMenuNodes = structuredHeaderMenuNodes.length > 0 ? structuredHeaderMenuNodes : fallbackHeaderMenuNodes;

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
    setIsToolsMenuOpen(false);
    setOpenHeaderDropdownId(null);
  }, [pathname]);

  useEffect(() => {
    setExpandedToolsParents((current) => {
      const next = { ...current };

      for (const item of toolsNavTopLevelItems) {
        const children = toolsNavChildrenByParent.get(item.key) ?? [];
        if (children.length === 0) {
          continue;
        }

        const scopedItemHref = toOrgScopedHref(orgSlug, item.href) ?? item.href;
        const isActive =
          isActivePrefixPath(currentPathname, scopedItemHref) ||
          children.some((child) => isActivePrefixPath(currentPathname, toOrgScopedHref(orgSlug, child.href) ?? child.href));
        if (isActive) {
          next[item.key] = true;
        } else if (!(item.key in next)) {
          next[item.key] = false;
        }
      }

      return next;
    });
  }, [currentPathname, orgSlug, toolsNavChildrenByParent, toolsNavTopLevelItems]);

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

    return () => {
      window.removeEventListener(ORG_SITE_EDITOR_STATE_EVENT, onEditorState);
    };
  }, [currentPathname, pathname]);

  const hasHeaderActions = canEditPages || canManageOrg;

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
      if (rafId) {
        return;
      }
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
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer?.disconnect();
      window.removeEventListener("resize", scheduleSyncHeight);
      window.removeEventListener("scroll", scheduleSyncHeight);
      document.documentElement.style.setProperty("--org-header-height", "0px");
      document.documentElement.style.setProperty("--org-header-bottom", "0px");
    };
  }, []);

  return (
    <div className="app-container sticky top-[var(--layout-gap)] z-40 pb-[var(--layout-gap)] pt-0" ref={rootRef}>
      <div className={cn("rounded-card border bg-surface shadow-floating transition-shadow", isScrolled ? "shadow-lg" : "") }>
        <div className="flex min-h-[64px] items-center gap-3 pb-2.5 pl-4 pr-2.5 pt-2.5 md:pb-4 md:pl-6 md:pr-4 md:pt-4">
          <div className="shrink-0 self-stretch">
            <Link className="flex h-full min-w-0 items-center gap-3 leading-none" href="/" prefetch>
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
          </div>

          {!isPageContentEditing ? (
            <nav className="hidden min-w-0 flex-1 md:block">
              <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
                {headerMenuNodes.map((node) => {
                  const isOpen = openHeaderDropdownId === node.item.id;

                  if (node.children.length === 0) {
                    return (
                      <NavItem
                        active={node.isActive}
                        href={node.href ?? undefined}
                        key={node.item.id}
                        rel={node.rel}
                        target={node.target}
                        variant="header"
                      >
                        {node.item.label}
                      </NavItem>
                    );
                  }

                  return (
                    <div
                      className="relative"
                      key={node.item.id}
                      onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setOpenHeaderDropdownId((current) => (current === node.item.id ? null : current));
                        }
                      }}
                      onMouseEnter={() => {
                        setOpenHeaderDropdownId(node.item.id);
                      }}
                      onMouseLeave={() => {
                        setOpenHeaderDropdownId((current) => (current === node.item.id ? null : current));
                      }}
                    >
                      <NavItem
                        active={node.isActive}
                        ariaExpanded={isOpen}
                        ariaHaspopup="menu"
                        href={node.href ?? undefined}
                        key={node.item.id}
                        rel={node.rel}
                        rightSlot={<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />}
                        target={node.target}
                        variant="header"
                        onClick={
                          node.href
                            ? undefined
                            : () => {
                                setOpenHeaderDropdownId((current) => (current === node.item.id ? null : node.item.id));
                              }
                        }
                      >
                        {node.item.label}
                      </NavItem>

                      {isOpen ? (
                        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-[16rem] rounded-card border bg-surface p-2 shadow-floating" role="menu">
                          {node.children.map((child) => (
                            <NavItem
                              active={child.isActive}
                              href={child.href ?? undefined}
                              key={child.item.id}
                              rel={child.rel}
                              role="menuitem"
                              target={child.target}
                              variant="dropdown"
                              onClick={() => {
                                setOpenHeaderDropdownId(null);
                              }}
                            >
                              {child.item.label}
                            </NavItem>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </nav>
          ) : null}

          {hasHeaderActions && !isPageContentEditing ? <span aria-hidden className="hidden h-6 w-px shrink-0 bg-border md:block" /> : null}

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            {canEditPages && isPageContentEditing ? (
              <Button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent(ORG_SITE_OPEN_BLOCK_LIBRARY_EVENT, {
                      detail: {
                        pathname: currentPathname || pathname
                      }
                    })
                  );
                }}
                size="md"
                type="button"
                variant="secondary"
              >
                <Plus className="h-4 w-4" />
                Add Block
              </Button>
            ) : null}

            {canEditPages && isPageContentEditing ? (
              <Button
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  window.dispatchEvent(
                    new CustomEvent(ORG_SITE_SET_EDITOR_EVENT, {
                      detail: {
                        pathname: currentPathname || pathname,
                        isEditing: false
                      }
                    })
                  );
                }}
                size="md"
                type="button"
                variant="primary"
              >
                Done
              </Button>
            ) : null}

            {canEditCurrentPage && !isPageContentEditing ? (
              <Button
                loading={isPageEditorInitializing}
                onClick={() => openEditorOnPath(currentPathname || orgBasePath)}
                size="md"
                type="button"
                variant="ghost"
              >
                <Pencil className="h-4 w-4" />
                Edit Page
              </Button>
            ) : null}

            {canEditPages && !isPageContentEditing ? (
              <Button
                onClick={() => {
                  setIsToolsMenuOpen(false);
                }}
                size="md"
                type="button"
                variant="ghost"
              >
                <LayoutDashboard className="h-4 w-4" />
                Edit Site
              </Button>
            ) : null}

            {canManageOrg && !isPageContentEditing ? (
              <div
                className="relative"
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsToolsMenuOpen(false);
                  }
                }}
              >
                <Button
                  aria-expanded={isToolsMenuOpen}
                  aria-label="Open admin menu"
                  onClick={() => setIsToolsMenuOpen((current) => !current)}
                  size="md"
                  type="button"
                >
                  <Wrench className="h-4 w-4" />
                  Tools
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isToolsMenuOpen ? "rotate-180" : "rotate-0")} />
                </Button>
                {isToolsMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[20rem] max-w-[calc(100vw-1rem)] rounded-card border bg-surface p-2 shadow-floating">
                    {toolsNavTopLevelItems.map((item) => {
                      const children = toolsNavChildrenByParent.get(item.key) ?? [];
                      const scopedItemHref = toOrgScopedHref(orgSlug, item.href) ?? item.href;
                      const isActive =
                        isActivePrefixPath(currentPathname, scopedItemHref) ||
                        children.some((child) => isActivePrefixPath(currentPathname, toOrgScopedHref(orgSlug, child.href) ?? child.href));
                      const isExpanded = Boolean(expandedToolsParents[item.key]);

                      return (
                        <div className="space-y-1" key={item.key}>
                          {children.length > 0 ? (
                            <NavItem
                              accentWhenActive
                              active={isActive}
                              icon={(() => {
                                const Icon = toolsNavIconMap[item.icon];
                                return <Icon className="h-[17px] w-[17px]" />;
                              })()}
                              rightSlot={<ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-180" : "rotate-0")} />}
                              size="md"
                              type="button"
                              variant="sidebar"
                              onClick={() => {
                                setExpandedToolsParents((current) => ({
                                  ...current,
                                  [item.key]: !Boolean(current[item.key])
                                }));
                              }}
                            >
                              {item.label}
                            </NavItem>
                          ) : (
                            <NavItem
                              accentWhenActive
                              active={isActive}
                              href={scopedItemHref}
                              icon={(() => {
                                const Icon = toolsNavIconMap[item.icon];
                                return <Icon className="h-[17px] w-[17px]" />;
                              })()}
                              size="md"
                              variant="sidebar"
                              onClick={() => setIsToolsMenuOpen(false)}
                            >
                              {item.label}
                            </NavItem>
                          )}
                          {children.length > 0 && isExpanded ? (
                            <div className="space-y-1 pb-1 pl-[14px]">
                              {children.map((child) => (
                                <NavItem
                                  active={isActivePrefixPath(currentPathname, toOrgScopedHref(orgSlug, child.href) ?? child.href)}
                                  href={toOrgScopedHref(orgSlug, child.href) ?? child.href}
                                  icon={(() => {
                                    const Icon = toolsNavIconMap[child.icon];
                                    return <Icon className="h-4 w-4" />;
                                  })()}
                                  key={child.key}
                                  size="sm"
                                  variant="sidebar"
                                  onClick={() => setIsToolsMenuOpen(false)}
                                >
                                  {child.label}
                                </NavItem>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {!isPageContentEditing ? <ProgramHeaderBar orgSlug={orgSlug} /> : null}
      </div>
    </div>
  );
}
