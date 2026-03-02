"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/components/ui/layout";
import { CenteredStateCard } from "@/components/ui/state";

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <AppPage className="flex min-h-[60vh] items-center py-10">
      <CenteredStateCard
        actions={
          <Button
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }

              router.push("/");
            }}
            variant="secondary"
          >
            Go Back
          </Button>
        }
        description="The page you requested does not exist."
        title="Page Not Found"
      />
    </AppPage>
  );
}
