import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

type PeoplePageTabKey = "directory" | "groups" | "roles";

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
          description: "Accounts and the people they manage",
          href: `/${orgSlug}/manage/people`,
          prefetch: false
        },
        {
          key: "groups",
          label: "Groups",
          description: "System-generated dynamic groups",
          href: `/${orgSlug}/manage/people/groups`,
          prefetch: false
        },
        {
          key: "roles",
          label: "Roles",
          description: "Permission sets and who holds them",
          href: `/${orgSlug}/manage/people/roles`,
          prefetch: false
        }
      ]}
    />
  );
}
