import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function AccountPlayersLoading() {
  return <PageLoadingSkeleton blocks={["h-24", "h-40", "h-40"]} titleClassName="w-44" />;
}
