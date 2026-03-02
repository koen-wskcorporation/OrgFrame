import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function ManageFacilityDetailLoading() {
  return <PageLoadingSkeleton blocks={["h-40", "h-72", "h-64"]} titleClassName="w-64" />;
}
