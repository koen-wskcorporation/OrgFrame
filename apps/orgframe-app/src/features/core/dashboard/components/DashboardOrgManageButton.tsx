"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { renderAdminNavNode } from "@/src/features/core/navigation/components/renderAdminNavNode";
import type { OrgHeaderManageNavItem } from "@/src/features/core/layout/components/OrgHeader";

type DashboardOrgManageButtonProps = {
  manageHref: string;
  manageNavItems: OrgHeaderManageNavItem[];
};

export function DashboardOrgManageButton({ manageHref, manageNavItems }: DashboardOrgManageButtonProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Button
      href={manageHref}
      size="sm"
      variant="secondary"
      dropdownOpen={open}
      onDropdownOpenChange={setOpen}
      dropdown={manageNavItems.map((node) =>
        renderAdminNavNode(node, {
          pathname: pathname ?? "",
          variant: "dropdown",
          size: "sm",
          dropdownPlacement: "bottom-end"
        })
      )}
    >
      <Settings className="h-4 w-4" />
      Manage
    </Button>
  );
}
