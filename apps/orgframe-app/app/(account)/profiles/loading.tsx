import { PageLoadingSkeleton } from "@orgframe/ui/primitives/skeleton";

export default function ProfilesLoading() {
  return <PageLoadingSkeleton blocks={["h-24", "h-40", "h-40"]} titleClassName="w-44" />;
}
