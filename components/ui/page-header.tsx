import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  showBorder?: boolean;
};

export function PageHeader({ title, description, actions, className, showBorder = true }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        showBorder ? "border-b pb-5" : "pb-0",
        className
      )}
    >
      <div>
        <h1 className="text-3xl font-semibold leading-tight text-text">{title}</h1>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
