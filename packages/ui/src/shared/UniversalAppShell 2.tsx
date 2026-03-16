type UniversalAppShellProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  mobileSidebar: React.ReactNode;
};

export function UniversalAppShell({ children, sidebar, mobileSidebar }: UniversalAppShellProps) {
  return (
    <main className="app-page-shell pb-3 pt-0 md:pb-4 md:pt-0">
      <div className="grid min-h-0 flex-1 items-start gap-[var(--layout-gap)] lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-[var(--layout-gap)]">
        <aside className="sticky z-30 hidden lg:block" style={{ top: "calc(var(--org-header-height, 0px) + var(--org-header-sticky-offset, 0px))" }}>
          {sidebar}
        </aside>

        <div className="app-workspace-content flex min-h-0 min-w-0 flex-col">
          <div className="sticky z-30 mb-[var(--layout-gap)] lg:hidden" style={{ top: "calc(var(--org-header-height, 0px) + var(--org-header-sticky-offset, 0px))" }}>
            {mobileSidebar}
          </div>
          <div className="app-page-stack app-page-stack--fill">{children}</div>
        </div>
      </div>
    </main>
  );
}
