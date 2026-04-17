import { AppPage } from "@orgframe/ui/primitives/layout";
import { PageLoadingSkeleton } from "@orgframe/ui/primitives/skeleton";

export default function OrgRouteLoading() {
  return (
    <AppPage className="py-6">
      <PageLoadingSkeleton blocks={["h-40", "h-28", "h-28"]} titleClassName="w-56" />
    </AppPage>
  );
}
