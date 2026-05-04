import { PageLoadingSkeleton } from "@orgframe/ui/primitives/skeleton";

export default function OrgManageLoading() {
  return <PageLoadingSkeleton blocks={["h-40", "h-40", "h-40"]} titleClassName="w-44" />;
}
