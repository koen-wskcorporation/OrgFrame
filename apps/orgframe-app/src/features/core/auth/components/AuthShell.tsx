import type { ReactNode } from "react";
import { CenteredFormShell } from "@/src/features/core/layout/components/CenteredFormShell";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <CenteredFormShell subtitle={subtitle} title={title}>
      {children}
    </CenteredFormShell>
  );
}
