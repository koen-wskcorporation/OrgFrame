import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function ManageFormDetailLoading() {
  return <PageLoadingSkeleton blocks={["h-96", "h-24"]} titleClassName="w-56" />;
}
