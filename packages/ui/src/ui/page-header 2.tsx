import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  showBorder?: boolean;
};

export function PageHeader({ title, description, actions, className, showBorder = false }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        showBorder ? "border-b pb-5 md:pb-6" : "",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="ui-page-title">{title}</h1>
        {description ? <p className="max-w-[68ch] text-sm leading-relaxed text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  );
}
