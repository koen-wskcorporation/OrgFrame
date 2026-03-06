import { WorkspaceSectionNav, type WorkspaceSectionNavItem } from "@/components/ui/workspace-section-nav";

type PageTabsProps<T extends string> = {
  ariaLabel: string;
  active: T;
  items: ReadonlyArray<WorkspaceSectionNavItem<T>>;
  className?: string;
};

export function PageTabs<T extends string>({ ariaLabel, active, items, className }: PageTabsProps<T>) {
  return <WorkspaceSectionNav active={active} ariaLabel={ariaLabel} className={className} items={items} />;
}
