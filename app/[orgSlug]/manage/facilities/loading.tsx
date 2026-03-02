import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function ManageFacilitiesLoading() {
  return <PageLoadingSkeleton blocks={["h-56", "h-72"]} titleClassName="w-52" />;
}
