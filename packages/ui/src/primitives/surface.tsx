import * as React from "react";
import { IconButton } from "@orgframe/ui/primitives/icon-button";
import { cn } from "./utils";

type SurfaceHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  titleId?: string;
  className?: string;
};

export function SurfaceHeader({ title, subtitle, titleId, className }: SurfaceHeaderProps) {
  return (
    <div className={cn("relative shrink-0 border-b px-5 py-4 pr-16 md:px-6", className)}>
      <h2 className="text-lg font-semibold leading-tight text-text" id={titleId}>
        {title}
      </h2>
      {subtitle ? <p className="mt-1 text-sm leading-relaxed text-text-muted">{subtitle}</p> : null}
    </div>
  );
}

type SurfaceBodyProps = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
};

export function SurfaceBody({ children, className, padded = true }: SurfaceBodyProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto [overflow-wrap:anywhere]",
        padded ? "overflow-x-hidden px-5 py-4 md:px-6" : null,
        className
      )}
    >
      {children}
    </div>
  );
}

type SurfaceFooterProps = {
  children: React.ReactNode;
  className?: string;
  footerRef?: React.Ref<HTMLDivElement>;
};

export function SurfaceFooter({ children, className, footerRef }: SurfaceFooterProps) {
  return (
    <div
      className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-surface px-5 py-4 md:px-6", className)}
      ref={footerRef}
    >
      {children}
    </div>
  );
}

type SurfaceCloseButtonProps = {
  label: string;
  onClick: () => void;
  className?: string;
};

export function SurfaceCloseButton({ label, onClick, className }: SurfaceCloseButtonProps) {
  return <IconButton className={cn("absolute right-3 top-3", className)} icon={<span className="text-lg leading-none">×</span>} label={label} onClick={onClick} />;
}
