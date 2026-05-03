"use client";

import { useEffect, useState } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { getAuditEventsPage } from "@/src/features/audit/actions";
import { AuditLogPanel } from "@/src/features/audit/components/AuditLogPanel";
import type { AuditPage } from "@/src/features/audit/types";

type AccountAuditTabProps = {
  orgSlug: string;
  userId: string;
};

/**
 * Lazy-loaded per-user audit log embedded inside the AccountEditPanel.
 * Silently hides itself if the viewer lacks `audit.read`.
 */
export function AccountAuditTab({ orgSlug, userId }: AccountAuditTabProps) {
  const [state, setState] = useState<{ status: "loading" | "hidden" | "ready" | "error"; page?: AuditPage; error?: string }>({
    status: "loading"
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const page = await getAuditEventsPage({
          orgSlug,
          involvingUserId: userId,
          page: 1,
          pageSize: 25
        });
        if (!cancelled) setState({ status: "ready", page });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Failed to load audit log.";
        // The server action redirects to /forbidden when permission is missing;
        // when called from a client component that surfaces as a fetch error.
        if (/forbidden/i.test(message) || /NEXT_REDIRECT/i.test(message)) {
          if (!cancelled) setState({ status: "hidden" });
          return;
        }
        if (!cancelled) setState({ status: "error", error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug, userId]);

  if (state.status === "hidden") return null;
  if (state.status === "loading") {
    return <p className="text-xs text-text-muted">Loading audit history…</p>;
  }
  if (state.status === "error") {
    return <Alert variant="destructive">{state.error}</Alert>;
  }
  if (!state.page) return null;

  return (
    <AuditLogPanel
      orgSlug={orgSlug}
      initialPage={state.page}
      scope={{ involvingUserId: userId, hideFilters: true }}
    />
  );
}
