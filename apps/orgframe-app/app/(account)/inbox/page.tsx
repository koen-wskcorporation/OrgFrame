import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";

export const metadata: Metadata = {
  title: "Inbox"
};

export default async function InboxPage() {
  await requireAuth();

  return (
    <PageStack>
      <PageHeader description="Messages and notifications across your profiles." showBorder={false} title="Inbox" />
      <p className="text-sm text-text-muted">Your inbox is empty.</p>
    </PageStack>
  );
}
