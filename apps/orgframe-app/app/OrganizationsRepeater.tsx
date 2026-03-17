"use client";

import { OrgCard } from "@orgframe/ui/dashboard/OrgCard";
import { Repeater } from "@orgframe/ui/ui/repeater";

type OrganizationItem = {
  orgId: string;
  orgName: string;
  orgSlug: string;
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
      getSearchValue={(organization) => `${organization.orgName} ${organization.orgSlug}`}
      items={organizations}
      searchPlaceholder="Search organizations"
      renderItem={({ item }) => (
        <OrgCard href={item.href} iconUrl={item.iconUrl} orgName={item.orgName} orgSlug={item.orgSlug} />
      )}
    />
  );
}
