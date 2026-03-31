"use client";

import { useMemo } from "react";
import { Building2, CalendarDays, CreditCard, FileText, Globe, Inbox, LayoutDashboard, MapPinned, Palette, Settings, Users, Wrench, type LucideIcon } from "lucide-react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@/src/features/core/navigation/components/OrgAreaSidebarNav";
import { getOrgAdminNavItems, type OrgAdminNavIcon } from "@/src/features/core/navigation/config/adminNav";
import type { OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import type { OrgToolAvailability } from "@/src/shared/org/features";

type ManageSidebarProps = {
  orgSlug: string;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
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

function navConfig(orgSlug: string, capabilities: OrgCapabilities | null, toolAvailability: OrgToolAvailability): OrgAreaSidebarConfig {
  const items = getOrgAdminNavItems(orgSlug, { capabilities, toolAvailability });

  const topLevel = items.filter((item) => !item.parentKey);
  const manageItem = topLevel.find((item) => item.key === "manage");

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
        match: "prefix" as const
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
    title: "Manage",
    subtitle: "Manage Your Org",
    mobileLabel: "Manage",
    ariaLabel: "Manage area navigation",
    collapseStorageKey: `manage-sidebar:${orgSlug}:collapsed`,
    autoCollapse: {
      enabled: true,
      includeChildItemHrefs: true,
      minAdditionalSegments: 1
    },
    items: sidebarItems
  };
}

export function ManageSidebar({ orgSlug, capabilities, toolAvailability, mobile = false, showHeader = true }: ManageSidebarProps) {
  const config = useMemo(() => navConfig(orgSlug, capabilities, toolAvailability), [capabilities, orgSlug, toolAvailability]);
  return <OrgAreaSidebarNav config={config} mobile={mobile} showHeader={showHeader} />;
}

type ManageSidebarMobileProps = {
  orgSlug: string;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
};

export function ManageSidebarMobile({ orgSlug, capabilities, toolAvailability }: ManageSidebarMobileProps) {
  const config = useMemo(() => navConfig(orgSlug, capabilities, toolAvailability), [capabilities, orgSlug, toolAvailability]);
  return <OrgAreaSidebarNavMobile config={config} />;
}

// Backward-compat aliases while imports migrate.
export const ToolsSidebar = ManageSidebar;
export const ToolsSidebarMobile = ManageSidebarMobile;
