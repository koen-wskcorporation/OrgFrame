import * as React from "react";
import { cn } from "@/lib/utils";

type PageStackProps = React.HTMLAttributes<HTMLDivElement>;

export function PageStack({ className, ...props }: PageStackProps) {
  return <div className={cn("app-page-stack", className)} {...props} />;
}

type SectionStackProps = React.HTMLAttributes<HTMLDivElement>;

export function SectionStack({ className, ...props }: SectionStackProps) {
  return <div className={cn("app-section-stack", className)} {...props} />;
}

type CardGridProps = React.HTMLAttributes<HTMLDivElement>;

export function CardGrid({ className, ...props }: CardGridProps) {
  return <div className={cn("ui-card-grid", className)} {...props} />;
}

type AppPageProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function AppPage<T extends React.ElementType = "main">({ as, className, children, ...props }: AppPageProps<T>) {
  const Component = (as ?? "main") as React.ElementType;
  return (
    <Component className={cn("app-page-shell", className)} {...props}>
      {children}
    </Component>
  );
}
