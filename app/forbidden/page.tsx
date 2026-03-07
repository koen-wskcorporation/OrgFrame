import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/components/ui/layout";
import { CenteredStateCard } from "@/components/ui/state";

export const metadata: Metadata = {
  title: "Access Forbidden"
};

export default function ForbiddenPage() {
  return (
    <AppPage className="flex min-h-[60vh] items-center py-10">
      <CenteredStateCard
        actions={
          <>
            <Button href="/">Back to Home</Button>
            <Button href="/auth/login" size="md" variant="ghost">
              Sign in as Different Account
            </Button>
          </>
        }
        description="You do not have permission to access this page or action."
        title="Access Forbidden"
      />
    </AppPage>
  );
}
