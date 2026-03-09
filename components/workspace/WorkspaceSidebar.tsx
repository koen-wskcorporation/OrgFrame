"use client";

import { useMemo } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  Globe,
  LayoutDashboard,
  MapPinned,
  Palette,
  Settings,
  SlidersHorizontal,
  Users,
  type LucideIcon
} from "lucide-react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@/components/workspace/OrgAreaSidebarNav";
import { getOrgWorkspaceNavItems, type OrgWorkspaceNavIcon } from "@/lib/org/workspaceNav";
import type { OrgFeatures } from "@/lib/org/features";
import { orgWorkspacePath } from "@/lib/org/routes";

type WorkspaceSidebarProps = {
  orgSlug: string;
  features: OrgFeatures;
  mobile?: boolean;
  showHeader?: boolean;
};

const iconMap: Record<OrgWorkspaceNavIcon, LucideIcon> = {
  briefcase: BriefcaseBusiness,
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
  sliders: SlidersHorizontal
};

function navConfig(orgSlug: string, features: OrgFeatures): OrgAreaSidebarConfig {
  const items = getOrgWorkspaceNavItems(orgSlug, features);
  const workspaceOverviewHref = orgWorkspacePath(orgSlug);

  const topLevel = items.filter((item) => !item.parentKey);
  const settingsItem = topLevel.find((item) => item.href.endsWith("/workspace/settings"));

  if (!settingsItem) {
    throw new Error("Org workspace navigation is missing a settings item.");
  }

  const otherTopLevel = topLevel.filter((item) => item.key !== settingsItem.key);
  const orderedTopLevel = [...otherTopLevel, settingsItem];

  const sidebarItems: OrgAreaSidebarConfig["items"] = orderedTopLevel.map((item) => {
    const children = items.filter((candidate) => candidate.parentKey === item.key);
    const icon = iconMap[item.icon];

    if (children.length === 0) {
      return {
        key: item.key,
        label: item.label,
        icon,
        href: item.href,
        match: item.href === workspaceOverviewHref ? ("exact" as const) : ("prefix" as const)
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
    title: "Workspace",
    subtitle: "Org Operations",
    mobileLabel: "Workspace",
    ariaLabel: "Workspace area navigation",
    collapseStorageKey: `workspace-sidebar:${orgSlug}:collapsed`,
    autoCollapse: {
      enabled: true,
      includeChildItemHrefs: true,
      minAdditionalSegments: 1
    },
    items: sidebarItems
  };
}

export function WorkspaceSidebar({ orgSlug, features, mobile = false, showHeader = true }: WorkspaceSidebarProps) {
  const config = useMemo(() => navConfig(orgSlug, features), [features, orgSlug]);
  return <OrgAreaSidebarNav config={config} mobile={mobile} showHeader={showHeader} />;
}

type WorkspaceSidebarMobileProps = {
  orgSlug: string;
  features: OrgFeatures;
};

export function WorkspaceSidebarMobile({ orgSlug, features }: WorkspaceSidebarMobileProps) {
  const config = useMemo(() => navConfig(orgSlug, features), [features, orgSlug]);
  return <OrgAreaSidebarNavMobile config={config} />;
}
