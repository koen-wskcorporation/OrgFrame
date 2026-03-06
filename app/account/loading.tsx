import { AppPage } from "@/components/ui/layout";
import { PageLoadingSkeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <AppPage className="py-8 md:py-10">
      <PageLoadingSkeleton blocks={["h-48"]} titleClassName="w-44" />
    </AppPage>
  );
}
