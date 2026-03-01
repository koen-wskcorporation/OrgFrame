"use client";

import { LayoutDashboard, Users } from "lucide-react";
import { useMemo } from "react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@/components/manage/OrgAreaSidebarNav";

type AccountSidebarProps = {
  mobile?: boolean;
  showHeader?: boolean;
};

function navConfig(): OrgAreaSidebarConfig {
  return {
    title: "Account",
    subtitle: "Profile and players",
    mobileLabel: "Account",
    ariaLabel: "Account navigation",
    collapseStorageKey: "account-sidebar:collapsed",
    items: [
      {
        key: "account-overview",
        label: "Overview",
        icon: LayoutDashboard,
        href: "/account",
        match: "exact"
      },
      {
        key: "account-players",
        label: "Players",
        icon: Users,
        href: "/account/players",
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
