import { AppPage } from "@orgframe/ui/primitives/layout";
import { PageLoadingSkeleton } from "@orgframe/ui/primitives/skeleton";

export default function AccountLoading() {
  return (
    <AppPage className="py-8 md:py-10">
      <PageLoadingSkeleton blocks={["h-48"]} titleClassName="w-44" />
    </AppPage>
  );
}
