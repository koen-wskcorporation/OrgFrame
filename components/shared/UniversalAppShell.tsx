type UniversalAppShellProps = {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  mobileSidebar: React.ReactNode;
};

export function UniversalAppShell({ children, sidebar, mobileSidebar }: UniversalAppShellProps) {
  return (
    <main className="app-shell w-full px-6 pb-3 pt-0 md:px-8 md:pb-4 md:pt-0">
      <div className="grid items-start gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-6">
        <aside className="sticky z-30 hidden lg:block" style={{ top: "calc(var(--org-header-height, 0px) + var(--org-header-sticky-offset, 0px))" }}>
          {sidebar}
        </aside>

        <div className="min-w-0">
          <div className="sticky z-30 mb-4 lg:hidden" style={{ top: "calc(var(--org-header-height, 0px) + var(--org-header-sticky-offset, 0px))" }}>
            {mobileSidebar}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
