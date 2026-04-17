import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

type PeoplePageTabKey = "directory" | "groups";

export function PeoplePageTabs({
  orgSlug,
  active
}: {
  orgSlug: string;
  active: PeoplePageTabKey;
}) {
  return (
    <PageTabs
      active={active}
      ariaLabel="People pages"
      items={[
        {
          key: "directory",
          label: "Directory",
          description: "Accounts and linked profiles",
          href: `/${orgSlug}/tools/people`,
          prefetch: false
        },
        {
          key: "groups",
          label: "Groups",
          description: "System-generated dynamic groups",
          href: `/${orgSlug}/tools/people/groups`,
          prefetch: false
        }
      ]}
    />
  );
}
