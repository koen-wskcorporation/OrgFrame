"use client";

import { Home, Inbox, Settings, Users } from "lucide-react";
import { useMemo } from "react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@/src/features/core/navigation/components/OrgAreaSidebarNav";

type AccountSidebarProps = {
  mobile?: boolean;
  showHeader?: boolean;
};

function navConfig(): OrgAreaSidebarConfig {
  return {
    title: "Account",
    subtitle: "Your personal workspace",
    mobileLabel: "Account",
    ariaLabel: "Account navigation",
    collapseStorageKey: "account-sidebar:collapsed",
    items: [
      {
        key: "account-home",
        label: "Home",
        icon: Home,
        href: "/",
        match: "exact"
      },
      {
        key: "account-profiles",
        label: "Profiles",
        icon: Users,
        href: "/profiles",
        match: "prefix"
      },
      {
        key: "account-inbox",
        label: "Inbox",
        icon: Inbox,
        href: "/inbox",
        match: "prefix"
      },
      {
        key: "account-settings",
        label: "Settings",
        icon: Settings,
        href: "/settings",
        match: "prefix"
      }
    ]
  };
}

export function AccountSidebar({ mobile = false, showHeader = true }: AccountSidebarProps) {
  const config = useMemo(() => navConfig(), []);
  return <OrgAreaSidebarNav config={config} mobile={mobile} showHeader={showHeader} />;
}

type AccountSidebarMobileProps = {
  // Reserved for future parity with other sidebars.
};

export function AccountSidebarMobile({}: AccountSidebarMobileProps) {
  const config = useMemo(() => navConfig(), []);
  return <OrgAreaSidebarNavMobile config={config} />;
}
