"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceCopilotProvider } from "@/src/features/workspace/copilot/WorkspaceCopilotProvider";
import { WorkspaceCopilotRail } from "@/src/features/workspace/components/WorkspaceCopilotRail";

type OrgScopedWorkspaceShellProps = {
  orgSlug: string;
  children: React.ReactNode;
};

/**
 * Sits inside <AppShell>'s content slot. Provides the WorkspaceCopilot
 * context to all org-scoped pages, and renders the legacy Copilot rail
 * as a side-by-side column on manage routes (xl+ only).
 *
 * NOTE: in the unified-shell design the rail is meant to graduate to a
 * proper <Panel> docked into the multi-panel system, so it can be
 * dragged/resized/swapped alongside other panels. Until that lands,
 * the inline rail keeps the existing UX working.
 */
export function OrgScopedWorkspaceShell({ orgSlug, children }: OrgScopedWorkspaceShellProps) {
  const pathname = usePathname();

  const showCopilotRail = useMemo(() => {
    if (!pathname) return false;
    return pathname === `/${orgSlug}/manage` || pathname.startsWith(`/${orgSlug}/manage/`);
  }, [orgSlug, pathname]);

  return (
    <WorkspaceCopilotProvider orgSlug={orgSlug}>
      {showCopilotRail ? (
        <div className="grid min-h-0 gap-[var(--layout-gap)] xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <div className="min-w-0">{children}</div>
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-[calc(var(--app-topbar-height,0px)+var(--layout-gap)*2)]">
              <WorkspaceCopilotRail />
            </div>
          </aside>
        </div>
      ) : (
        children
      )}
    </WorkspaceCopilotProvider>
  );
}
