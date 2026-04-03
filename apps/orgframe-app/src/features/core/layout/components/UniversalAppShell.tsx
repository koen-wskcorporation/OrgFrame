type UniversalAppShellProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  mobileSidebar: React.ReactNode;
};

export function UniversalAppShell({ children, sidebar, mobileSidebar }: UniversalAppShellProps) {
  const stickyTopOffset = "calc(var(--org-header-height, 0px) + var(--layout-gap))";

  return (
    <main className="app-page-shell pb-3 pt-0 md:pb-4 md:pt-0">
      <div className="grid min-h-0 flex-1 items-stretch gap-[var(--layout-gap)] lg:items-start lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-[var(--layout-gap)]">
        <aside className="hidden h-fit self-start lg:block">
          <div className="sticky z-30 h-fit self-start" style={{ top: stickyTopOffset }}>
            {sidebar}
          </div>
        </aside>

        <div className="app-workspace-content flex min-h-0 min-w-0 flex-col">
          <div className="sticky z-30 mb-[var(--layout-gap)] lg:hidden" style={{ top: stickyTopOffset }}>
            {mobileSidebar}
          </div>
          <div className="app-page-stack app-page-stack--fill">{children}</div>
        </div>
      </div>
    </main>
  );
}
