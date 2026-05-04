import * as React from "react";

type SidebarShellProps = {
  /**
   * Sidebar slot. Sticks below the topbar (anchored to
   * --app-topbar-height set by AppShell, or the viewport top when
   * there is no AppShell on the page).
   */
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Body grid for routes that need a sidebar (currently /manage and the
 * account area). Renders inside AppShell's content column. Decoupling
 * the sidebar from AppShell prevents parallel-slot bleed where a
 * stale sidebar would persist on routes that don't render one.
 *
 *   <div class="sidebar-shell">
 *     ├── <aside class="sidebar-shell__sidebar">
 *     └── <div class="sidebar-shell__content">
 */
export function SidebarShell({ sidebar, children }: SidebarShellProps) {
  return (
    <div className="sidebar-shell">
      {sidebar ? <aside className="sidebar-shell__sidebar">{sidebar}</aside> : null}
      <div className="sidebar-shell__content">{children}</div>
    </div>
  );
}
