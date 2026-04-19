"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceCopilotProvider } from "@/src/features/workspace/copilot/WorkspaceCopilotProvider";
import { WorkspaceCopilotRail } from "@/src/features/workspace/components/WorkspaceCopilotRail";

type OrgScopedWorkspaceShellProps = {
  orgSlug: string;
  children: React.ReactNode;
};

export function OrgScopedWorkspaceShell({ orgSlug, children }: OrgScopedWorkspaceShellProps) {
  const pathname = usePathname();

  const showCopilotRail = useMemo(() => {
    if (!pathname) {
      return false;
    }

    return pathname === `/${orgSlug}/manage` || pathname.startsWith(`/${orgSlug}/manage/`);
  }, [orgSlug, pathname]);

  return (
    <WorkspaceCopilotProvider orgSlug={orgSlug}>
      {showCopilotRail ? (
        <div className="grid min-h-0 gap-[var(--layout-gap)] xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <div className="min-w-0">{children}</div>
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-[calc(var(--org-header-height,0px)+var(--layout-gap))]">
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
