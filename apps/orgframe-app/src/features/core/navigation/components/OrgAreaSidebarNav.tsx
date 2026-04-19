"use client";

import { ChevronDown, Menu, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Chip } from "@orgframe/ui/primitives/chip";
import { OrgAreaSidebarHeader, OrgAreaSidebarShell } from "@/src/features/core/navigation/components/OrgAreaSidebarShell";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { cn } from "@orgframe/ui/primitives/utils";

export type MatchMode = "exact" | "prefix";

type SidebarNavItemBase = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  match?: MatchMode;
  disabled?: boolean;
  soon?: boolean;
};

export type OrgAreaSidebarLeafItem = SidebarNavItemBase & {
  children?: never;
  subtreePrefixes?: never;
};

export type OrgAreaSidebarChildItem = SidebarNavItemBase;

export type OrgAreaSidebarParentItem = SidebarNavItemBase & {
  children: OrgAreaSidebarChildItem[];
  subtreePrefixes?: string[];
};

export type OrgAreaSidebarNode = OrgAreaSidebarLeafItem | OrgAreaSidebarParentItem;

export type OrgAreaSidebarConfig = {
  title: string;
  subtitle: string;
  roleChipLabel?: string;
  mobileLabel: string;
  ariaLabel: string;
  items: OrgAreaSidebarNode[];
  collapseStorageKey?: string;
  autoCollapse?: {
    enabled?: boolean;
    includeChildItemHrefs?: boolean;
    minAdditionalSegments?: number;
  };
};

type OrgAreaSidebarNavProps = {
  config: OrgAreaSidebarConfig;
  mobile?: boolean;
  showHeader?: boolean;
};

type OrgAreaSidebarNavMobileProps = {
  config: OrgAreaSidebarConfig;
};

function isParentNode(node: OrgAreaSidebarNode): node is OrgAreaSidebarParentItem {
  return "children" in node && Array.isArray((node as OrgAreaSidebarParentItem).children);
}

function matchesPath(pathname: string, href: string, mode: MatchMode = "prefix") {
  if (mode === "exact") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isParentActive(pathname: string, item: OrgAreaSidebarParentItem) {
  const parentHrefActive = item.href ? matchesPath(pathname, item.href, item.match ?? "prefix") : false;
  const subtreeActive = (item.subtreePrefixes ?? []).some((prefix) => matchesPath(pathname, prefix, "prefix"));
  const childActive = item.children.some((child) => (child.href ? matchesPath(pathname, child.href, child.match ?? "prefix") : false));
  return parentHrefActive || subtreeActive || childActive;
}

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

function pathSegmentCount(path: string) {
  const normalized = normalizePath(path);
  if (normalized === "/") {
    return 0;
  }

  return normalized.split("/").filter(Boolean).length;
}

function collectAutoCollapseRoots(items: OrgAreaSidebarNode[], includeChildItemHrefs: boolean) {
  const roots = new Set<string>();

  for (const node of items) {
    if (node.href) {
      roots.add(normalizePath(node.href));
    }

    if (!includeChildItemHrefs || !isParentNode(node)) {
      continue;
    }

    for (const child of node.children) {
      if (child.href) {
        roots.add(normalizePath(child.href));
      }
    }
  }

  return [...roots];
}

function shouldAutoCollapse(pathname: string, config: OrgAreaSidebarConfig) {
  const autoCollapseConfig = config.autoCollapse;
  if (!autoCollapseConfig?.enabled) {
    return false;
  }

  const includeChildItemHrefs = autoCollapseConfig.includeChildItemHrefs ?? true;
  const minAdditionalSegments = autoCollapseConfig.minAdditionalSegments ?? 1;
  const normalizedPath = normalizePath(pathname);
  const roots = collectAutoCollapseRoots(config.items, includeChildItemHrefs);
  const matchingRoots = roots.filter((root) => matchesPath(normalizedPath, root, "prefix"));

  if (matchingRoots.length === 0) {
    return false;
  }

  const bestMatchingRoot = matchingRoots.reduce((currentBest, candidate) => {
    return candidate.length > currentBest.length ? candidate : currentBest;
  });

  const additionalSegments = pathSegmentCount(normalizedPath) - pathSegmentCount(bestMatchingRoot);
  return additionalSegments >= minAdditionalSegments;
}

function SoonBadge() {
  return <Chip className="normal-case tracking-normal" color="neutral">Soon</Chip>;
}

export function OrgAreaSidebarNav({ config, mobile = false, showHeader = true }: OrgAreaSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPathname, setOptimisticPathname] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const canCollapse = !mobile;
  const collapseStorageKey = config.collapseStorageKey ?? "org-area-sidebar:collapsed";
  const activePathname = optimisticPathname ?? pathname;

  useEffect(() => {
    setOptimisticPathname(null);
  }, [pathname]);

  useEffect(() => {
    if (!canCollapse) {
      return;
    }

    try {
      const shouldCollapseForPath = shouldAutoCollapse(pathname, config);
      const storedValue = window.localStorage.getItem(collapseStorageKey);
      setCollapsed(shouldCollapseForPath || storedValue === "true");
    } catch {
      setCollapsed(shouldAutoCollapse(pathname, config));
    }
  }, [canCollapse, collapseStorageKey, config, pathname]);

  useEffect(() => {
    if (!canCollapse) {
      return;
    }

    try {
      window.localStorage.setItem(collapseStorageKey, String(collapsed));
    } catch {
      // Ignore localStorage failures.
    }
  }, [canCollapse, collapseStorageKey, collapsed]);

  useEffect(() => {
    if (!canCollapse) {
      return;
    }

    if (shouldAutoCollapse(pathname, config)) {
      setCollapsed(true);
    }
  }, [canCollapse, config, pathname]);

  function markOptimisticActive(href?: string) {
    if (!href || !href.startsWith("/")) {
      return;
    }

    setOptimisticPathname(normalizePath(href));
  }

  function prefetchRoute(href?: string) {
    if (!href || !href.startsWith("/")) {
      return;
    }

    router.prefetch(href);
  }

  useEffect(() => {
    const hrefs = new Set<string>();

    for (const item of config.items) {
      if (item.href?.startsWith("/")) {
        hrefs.add(item.href);
      }

      if (!isParentNode(item)) {
        continue;
      }

      for (const child of item.children) {
        if (child.href?.startsWith("/")) {
          hrefs.add(child.href);
        }
      }
    }

    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [config.items, router]);

  function renderLeafItem(item: OrgAreaSidebarChildItem, options?: { size?: "sm" | "md"; variant?: "sidebar" | "dropdown" }) {
    const isActive = item.href ? matchesPath(activePathname, item.href, item.match ?? "prefix") : false;
    const Icon = item.icon;

    return (
      <NavItem
        active={isActive}
        ariaLabel={collapsed ? item.label : undefined}
        iconOnly={collapsed}
        className={collapsed ? "mx-auto !h-10 !w-10 !min-h-0 !justify-center !p-0" : undefined}
        disabled={item.disabled || !item.href}
        href={item.href}
        icon={<Icon className="h-[17px] w-[17px]" />}
        key={item.key}
        rightSlot={!collapsed && item.soon ? <SoonBadge /> : null}
        size={options?.size ?? "md"}
        title={item.label}
        variant={options?.variant ?? "sidebar"}
        prefetch
        onMouseDown={() => {
          markOptimisticActive(item.href);
          prefetchRoute(item.href);
        }}
        onClick={() => markOptimisticActive(item.href)}
      >
        {item.label}
      </NavItem>
    );
  }

  return (
    <OrgAreaSidebarShell collapsed={collapsed} mobile={mobile}>
      <OrgAreaSidebarHeader
        canCollapse={canCollapse}
        collapsed={collapsed}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
        roleChipLabel={config.roleChipLabel}
        show={showHeader}
        title={config.title}
      />

      <nav aria-label={config.ariaLabel} className={cn(collapsed ? "flex flex-col items-center gap-2" : "space-y-1")}>
        {config.items.map((node) => {
          if (!isParentNode(node) || collapsed) {
            return renderLeafItem(node as OrgAreaSidebarChildItem);
          }

          const Icon = node.icon;
          const parentActive = isParentActive(activePathname, node);

          return (
            <NavItem
              key={node.key}
              active={parentActive}
              disabled={node.disabled || !node.href}
              dropdown={node.children.map((child) => renderLeafItem(child, { size: "sm", variant: "dropdown" }))}
              dropdownPlacement="bottom-end"
              href={node.href}
              icon={<Icon className="h-[17px] w-[17px]" />}
              prefetch
              rightSlot={node.soon ? <SoonBadge /> : null}
              size="md"
              title={node.label}
              variant="sidebar"
              onMouseDown={() => {
                markOptimisticActive(node.href);
                prefetchRoute(node.href);
              }}
              onClick={() => markOptimisticActive(node.href)}
            >
              {node.label}
            </NavItem>
          );
        })}
      </nav>
    </OrgAreaSidebarShell>
  );
}

export function OrgAreaSidebarNavMobile({ config }: OrgAreaSidebarNavMobileProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <button
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between rounded-control border border-border bg-surface px-3 text-sm font-semibold text-text transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="flex items-center gap-2">
          <Menu className="h-4 w-4 text-text-muted" />
          {config.mobileLabel}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-text-muted transition-transform", open ? "rotate-180" : "rotate-0")} />
      </button>

      {open ? (
        <div className="mt-3">
          <OrgAreaSidebarNav config={config} mobile showHeader={false} />
        </div>
      ) : null}
    </div>
  );
}
