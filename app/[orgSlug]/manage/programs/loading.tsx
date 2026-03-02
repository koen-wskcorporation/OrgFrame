import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function ManageProgramsLoading() {
  return <PageLoadingSkeleton blocks={["h-40", "h-40", "h-56"]} titleClassName="w-52" />;
}
