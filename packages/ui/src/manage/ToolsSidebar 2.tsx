"use client";

import { useMemo } from "react";
import { Building2, CalendarDays, CreditCard, FileText, Globe, Inbox, LayoutDashboard, MapPinned, Palette, Settings, Users, Wrench, type LucideIcon } from "lucide-react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@orgframe/ui/manage/OrgAreaSidebarNav";
import { getOrgAdminNavItems, type OrgAdminNavIcon } from "@/lib/org/toolsNav";

type ToolsSidebarProps = {
  orgSlug: string;
  mobile?: boolean;
  showHeader?: boolean;
};

const iconMap: Record<OrgAdminNavIcon, LucideIcon> = {
  wrench: Wrench,
  settings: Settings,
  building: Building2,
  globe: Globe,
  palette: Palette,
  users: Users,
  "credit-card": CreditCard,
  layout: LayoutDashboard,
  calendar: CalendarDays,
  "file-text": FileText,
  map: MapPinned,
  inbox: Inbox
};

function navConfig(orgSlug: string): OrgAreaSidebarConfig {
  const items = getOrgAdminNavItems(orgSlug);
  const toolsOverviewHref = `/${orgSlug}/tools`;

  const topLevel = items.filter((item) => !item.parentKey);
  const manageItem = topLevel.find((item) => item.href.endsWith("/tools/manage"));

  if (!manageItem) {
    throw new Error("Org admin navigation is missing a manage item.");
  }

  const otherTopLevel = topLevel.filter((item) => item.key !== manageItem.key);
  const orderedTopLevel = [...otherTopLevel, manageItem];

  const sidebarItems: OrgAreaSidebarConfig["items"] = orderedTopLevel.map((item) => {
    const children = items.filter((candidate) => candidate.parentKey === item.key);
    const icon = iconMap[item.icon];

    if (children.length === 0) {
      return {
        key: item.key,
        label: item.label,
        icon,
        href: item.href,
        match: item.href === toolsOverviewHref ? ("exact" as const) : ("prefix" as const)
      };
    }

    return {
      key: item.key,
      label: item.label,
      icon,
      href: item.href,
      match: "prefix" as const,
      subtreePrefixes: [item.href, ...children.map((child) => child.href)],
      children: children.map((child) => ({
        key: child.key,
        label: child.label,
        icon: iconMap[child.icon],
        href: child.href,
        match: "prefix" as const
      }))
    };
  });

  return {
    title: "Tools",
    subtitle: "Manage Your Org",
    mobileLabel: "Tools",
    ariaLabel: "Tools area navigation",
    collapseStorageKey: `tools-sidebar:${orgSlug}:collapsed`,
    autoCollapse: {
      enabled: true,
      includeChildItemHrefs: true,
      minAdditionalSegments: 1
    },
    items: sidebarItems
  };
}

export function ToolsSidebar({ orgSlug, mobile = false, showHeader = true }: ToolsSidebarProps) {
  const config = useMemo(() => navConfig(orgSlug), [orgSlug]);
  return <OrgAreaSidebarNav config={config} mobile={mobile} showHeader={showHeader} />;
}

type ToolsSidebarMobileProps = {
  orgSlug: string;
};

export function ToolsSidebarMobile({ orgSlug }: ToolsSidebarMobileProps) {
  const config = useMemo(() => navConfig(orgSlug), [orgSlug]);
  return <OrgAreaSidebarNavMobile config={config} />;
}
