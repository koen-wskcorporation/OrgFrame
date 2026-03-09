import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function WorkspaceFacilityLoading() {
  return <PageLoadingSkeleton blocks={["h-72", "h-[72vh]"]} titleClassName="w-56" />;
}
