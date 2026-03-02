import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function ManageProgramDetailLoading() {
  return <PageLoadingSkeleton blocks={["h-80", "h-72", "h-72"]} titleClassName="w-56" />;
}
