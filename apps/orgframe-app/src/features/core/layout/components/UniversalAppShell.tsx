import * as React from "react";
import { AppShell } from "./AppShell";

type UniversalAppShellProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  mobileSidebar: React.ReactNode;
};

/**
 * Thin compat wrapper around <AppShell> for areas that don't use the
 * org-level parallel-route slots (e.g. the (account) route group, which
 * lives outside [orgSlug]). Provides the same sidebar/mobile-sidebar
 * dual rendering the older grid-based shell used to do.
 *
 * Inside [orgSlug] the parallel-route @sidebar slot fills the sidebar
 * directly — DON'T also wrap nested layouts in this component, or the
 * sidebar will render twice.
 */
export function UniversalAppShell({ children, sidebar, mobileSidebar }: UniversalAppShellProps) {
  return (
    <AppShell
      topbar={null}
      sidebar={
        <>
          <div className="hidden lg:block">{sidebar}</div>
          <div className="lg:hidden">{mobileSidebar}</div>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
