import { PageHeader } from "@/components/ui/page-header";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

type DashboardSectionProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function DashboardShell({ title, subtitle, actions, children }: DashboardShellProps) {
  return (
    <main className="app-shell w-full px-6 pb-8 pt-0 md:px-8 md:pb-10 md:pt-0">
      <div className="space-y-8">
        <PageHeader actions={actions} description={subtitle} title={title} />
        <div className="space-y-8">{children}</div>
      </div>
    </main>
  );
}

export function DashboardSection({ title, description, actions, children }: DashboardSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-text">{title}</h2>
          {description ? <p className="text-sm text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
