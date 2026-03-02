import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { AuthDialogTrigger } from "@/components/auth/AuthDialogTrigger";
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
            <Link href="/">
              <Button>Back to Dashboard</Button>
            </Link>
            <AuthDialogTrigger label="Sign in as Different Account" size="md" variant="ghost" />
          </>
        }
        description="You do not have permission to access this page or action."
        title="Access Forbidden"
      />
    </AppPage>
  );
}
