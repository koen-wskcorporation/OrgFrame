import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-control bg-surface-muted", className)} {...props} />;
}

type PageLoadingSkeletonProps = {
  className?: string;
  titleClassName?: string;
  blocks?: string[];
};

export function PageLoadingSkeleton({
  className,
  titleClassName = "w-44",
  blocks = ["h-40", "h-40", "h-40"]
}: PageLoadingSkeletonProps) {
  return (
    <div className={cn("app-section-stack", className)}>
      <Skeleton className={cn("h-8 rounded-control", titleClassName)} />
      {blocks.map((blockClassName, index) => (
        <Skeleton className={cn("rounded-card border", blockClassName)} key={`${blockClassName}-${index}`} />
      ))}
    </div>
  );
}
