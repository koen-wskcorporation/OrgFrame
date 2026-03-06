import { AppPage } from "@/components/ui/layout";
import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function OrgRouteLoading() {
  return (
    <AppPage className="py-6">
      <PageLoadingSkeleton blocks={["h-40", "h-28", "h-28"]} titleClassName="w-56" />
    </AppPage>
  );
}
