"use client";

import { NavItem, type NavItemProps } from "@orgframe/ui/primitives/nav-item";
import { ORG_ADMIN_ICON_MAP } from "@/src/features/core/navigation/config/iconRegistry";
import type { OrgAdminNavItem, OrgAdminNavNode, OrgAdminNavMatch } from "@/src/features/core/navigation/config/adminNav";

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

export function matchesAdminNavPath(pathname: string, href: string, mode: OrgAdminNavMatch = "prefix") {
  const current = normalizePath(pathname);
  const target = normalizePath(href);
  if (mode === "exact") {
    return current === target;
  }
  return current === target || current.startsWith(`${target}/`);
}

export function isAdminNavNodeActive(pathname: string, node: OrgAdminNavNode) {
  if (matchesAdminNavPath(pathname, node.href, node.match)) {
    return true;
  }
  return node.children.some((child) => matchesAdminNavPath(pathname, child.href, child.match));
}

type RenderOptions = {
  pathname: string;
  variant: NavItemProps["variant"];
  size?: NavItemProps["size"];
  iconOnly?: boolean;
  onNavigate?: (href: string) => void;
  onPrefetch?: (href: string) => void;
  dropdownPlacement?: NavItemProps["dropdownPlacement"];
};

function renderLeaf(item: OrgAdminNavItem, options: RenderOptions) {
  const Icon = ORG_ADMIN_ICON_MAP[item.icon];
  const active = matchesAdminNavPath(options.pathname, item.href, item.match);
  const { onNavigate, onPrefetch } = options;
  return (
    <NavItem
      active={active}
      ariaLabel={options.iconOnly ? item.label : undefined}
      className={options.iconOnly ? "mx-auto !h-10 !w-10 !min-h-0 !justify-center !p-0" : undefined}
      href={item.href}
      icon={<Icon className="h-[17px] w-[17px]" />}
      iconOnly={options.iconOnly}
      key={item.key}
      prefetch
      size={options.size ?? "md"}
      title={item.label}
      variant={options.variant}
      onMouseDown={() => {
        onNavigate?.(item.href);
        onPrefetch?.(item.href);
      }}
      onClick={() => onNavigate?.(item.href)}
    >
      {item.label}
    </NavItem>
  );
}

export function renderAdminNavNode(node: OrgAdminNavNode, options: RenderOptions): React.ReactNode {
  const Icon = ORG_ADMIN_ICON_MAP[node.icon];
  const { onNavigate, onPrefetch } = options;

  if (node.children.length === 0 || options.iconOnly) {
    return renderLeaf(node, options);
  }

  const parentActive = isAdminNavNodeActive(options.pathname, node);
  const childVariant: NavItemProps["variant"] = "dropdown";

  return (
    <NavItem
      active={parentActive}
      dropdown={node.children.map((child) =>
        renderLeaf(child, {
          ...options,
          variant: childVariant,
          size: "sm",
          iconOnly: false
        })
      )}
      dropdownPlacement={options.dropdownPlacement ?? "bottom-end"}
      href={node.href}
      icon={<Icon className="h-[17px] w-[17px]" />}
      key={node.key}
      prefetch
      size={options.size ?? "md"}
      title={node.label}
      variant={options.variant}
      onMouseDown={() => {
        onNavigate?.(node.href);
        onPrefetch?.(node.href);
      }}
      onClick={() => onNavigate?.(node.href)}
    >
      {node.label}
    </NavItem>
  );
}
