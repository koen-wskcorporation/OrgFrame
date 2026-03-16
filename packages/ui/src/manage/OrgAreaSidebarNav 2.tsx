"use client";

import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@orgframe/ui/ui/chip";
import { IconButton } from "@orgframe/ui/ui/icon-button";
import { NavItem } from "@orgframe/ui/ui/nav-item";
import { cn } from "@/lib/utils";

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
  return "children" in node;
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
  const [collapsed, setCollapsed] = useState(false);
  const canCollapse = !mobile;
  const collapseStorageKey = config.collapseStorageKey ?? "org-area-sidebar:collapsed";

  const parentNodes = useMemo(
    () => config.items.filter((node): node is OrgAreaSidebarParentItem => isParentNode(node)),
    [config.items]
  );

  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>(() => {
    return parentNodes.reduce<Record<string, boolean>>((draft, node) => {
      draft[node.key] = isParentActive(pathname, node);
      return draft;
    }, {});
  });

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

  useEffect(() => {
    setExpandedByKey((current) => {
      const next = { ...current };

      for (const node of parentNodes) {
        const active = isParentActive(pathname, node);

        if (active) {
          next[node.key] = true;
          continue;
        }

        if (!(node.key in next)) {
          next[node.key] = false;
        }
      }

      return next;
    });
  }, [pathname, parentNodes]);

  function toggleParent(key: string) {
    setExpandedByKey((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  function renderLeafItem(item: OrgAreaSidebarLeafItem) {
    const isActive = item.href ? matchesPath(pathname, item.href, item.match ?? "prefix") : false;
    const Icon = item.icon;

    return (
      <NavItem
        active={isActive}
        accentWhenActive
        ariaLabel={collapsed ? item.label : undefined}
        iconOnly={collapsed}
        className={collapsed ? "mx-auto !h-10 !w-10 !min-h-0 !justify-center !p-0" : undefined}
        disabled={item.disabled || !item.href}
        href={item.href}
        icon={<Icon className="h-[17px] w-[17px]" />}
        key={item.key}
        rightSlot={!collapsed && item.soon ? <SoonBadge /> : null}
        size="md"
        title={item.label}
        variant="sidebar"
      >
        {item.label}
      </NavItem>
    );
  }

  function renderChildItem(item: OrgAreaSidebarChildItem) {
    const isActive = item.href ? matchesPath(pathname, item.href, item.match ?? "prefix") : false;
    const Icon = item.icon;

    return (
      <NavItem
        active={isActive}
        disabled={item.disabled || !item.href}
        href={item.href}
        icon={<Icon className="h-4 w-4" />}
        key={item.key}
        rightSlot={item.soon ? <SoonBadge /> : null}
        size="sm"
        variant="sidebar"
      >
        {item.label}
      </NavItem>
    );
  }

  return (
    <aside
      className={cn(
        "border border-border bg-surface transition-[width,padding,border-radius] duration-200",
        mobile ? "rounded-card p-4 shadow-card" : collapsed ? "w-20 rounded-card p-4 shadow-card" : "w-[280px] rounded-card p-4 shadow-card"
      )}
    >
      {showHeader && !collapsed ? (
        <>
          <header className="flex min-h-[44px] items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold leading-tight tracking-tight text-text">{config.title}</h2>
              <p className="mt-1 text-xs text-text-muted">{config.subtitle}</p>
            </div>
            {canCollapse ? (
              <IconButton icon={<PanelLeftClose />} label="Collapse sidebar" onClick={() => setCollapsed(true)} />
            ) : null}
          </header>

          <div className="my-3 border-t border-border" />
        </>
      ) : null}

      {showHeader && collapsed && canCollapse ? (
        <>
          <header className="flex min-h-[44px] items-center justify-center">
            <IconButton icon={<PanelLeftOpen />} label="Expand sidebar" onClick={() => setCollapsed(false)} />
          </header>

          <div className="my-3 border-t border-border" />
        </>
      ) : null}

      <nav aria-label={config.ariaLabel} className={cn(collapsed ? "flex flex-col items-center gap-2" : "space-y-1")}>
        {config.items.map((node) => {
          if (!isParentNode(node)) {
            return renderLeafItem(node);
          }

          const Icon = node.icon;
          const expanded = !collapsed && Boolean(expandedByKey[node.key]);
          const parentActive = isParentActive(pathname, node);
          const parentDisabled = node.disabled || (!node.href && node.children.length === 0);

          return (
            <div className={cn(collapsed ? "w-10" : "space-y-1")} key={node.key}>
              <NavItem
                active={parentActive}
                accentWhenActive
                ariaLabel={collapsed ? node.label : undefined}
                ariaExpanded={expanded}
                iconOnly={collapsed}
                className={cn(
                  parentDisabled ? "opacity-55" : undefined,
                  collapsed ? "mx-auto !h-10 !w-10 !min-h-0 !justify-center !p-0" : undefined
                )}
                disabled={!node.href && collapsed}
                href={node.href}
                icon={<Icon className="h-[17px] w-[17px]" />}
                onClick={!collapsed ? () => toggleParent(node.key) : undefined}
                rightSlot={
                  !collapsed ? (
                    <span className="flex items-center gap-2 text-text-muted">
                      {node.soon ? <SoonBadge /> : null}
                      <ChevronDown className={cn("h-4 w-4 transition-transform", expanded ? "rotate-180" : "rotate-0")} />
                    </span>
                  ) : null
                }
                size="md"
                title={node.label}
                type="button"
                variant="sidebar"
              >
                {node.label}
              </NavItem>

              {expanded ? <div className="space-y-1 pl-[14px]">{node.children.map((child) => renderChildItem(child))}</div> : null}
            </div>
          );
        })}
      </nav>
    </aside>
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
