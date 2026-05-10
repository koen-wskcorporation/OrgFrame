import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";

export const metadata: Metadata = {
  title: "Inbox"
};

export default async function InboxPage() {
  await requireAuth();

  return (
    <PageShell description="Messages and notifications across your profiles." title="Inbox">
      <p className="text-sm text-text-muted">Your inbox is empty.</p>
    </PageShell>
  );
}
