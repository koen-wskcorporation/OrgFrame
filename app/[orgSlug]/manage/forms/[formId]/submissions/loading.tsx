import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function ManageFormSubmissionsLoading() {
  return <PageLoadingSkeleton blocks={["h-80"]} titleClassName="w-56" />;
}
