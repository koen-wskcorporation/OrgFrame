"use client";

import { OrgCard } from "@/src/features/core/dashboard/components/OrgCard";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import type { OrgType } from "@/src/shared/org/orgTypes";

type OrganizationItem = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgType?: OrgType | null;
  displayHost?: string;
  iconUrl?: string | null;
  href: string;
};

type OrganizationsRepeaterProps = {
  organizations: OrganizationItem[];
};

export function OrganizationsRepeater({ organizations }: OrganizationsRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No organizations found."
      getItemKey={(organization) => organization.orgId}
      getSearchValue={(organization) => `${organization.orgName} ${organization.orgSlug} ${organization.displayHost ?? ""}`}
      items={organizations}
      searchPlaceholder="Search organizations"
      renderItem={({ item }) => (
        <OrgCard
          displayHost={item.displayHost}
          href={item.href}
          iconUrl={item.iconUrl}
          orgName={item.orgName}
          orgSlug={item.orgSlug}
          orgType={item.orgType}
        />
      )}
    />
  );
}
