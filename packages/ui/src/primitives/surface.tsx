import * as React from "react";
import { Avatar } from "./avatar";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "./utils";

type SurfaceHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  showAvatar?: boolean;
  avatarUrl?: string | null;
  avatarAlt?: string;
  topAction?: React.ReactNode;
  titleId?: string;
  className?: string;
};

export function SurfaceHeader({ title, subtitle, showAvatar = false, avatarUrl = null, avatarAlt, topAction, titleId, className }: SurfaceHeaderProps) {
  const avatarSizePx = subtitle ? 44 : 36;
  const titleString = typeof title === "string" ? title : null;

  return (
    <div className={cn("relative shrink-0 border-b px-5 py-4 pr-16 md:px-6", className)}>
      {topAction ? <div className="mb-2">{topAction}</div> : null}
      <div className="flex min-w-0 items-start gap-3">
        {showAvatar ? (
          <Avatar alt={avatarAlt ?? (titleString ? `${titleString} avatar` : "Header avatar")} name={titleString} sizePx={avatarSizePx} src={avatarUrl} />
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold leading-tight text-text" id={titleId}>
            {title}
          </h2>
          {subtitle ? <p className="truncate text-sm leading-relaxed text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
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
        // The scroll viewport must always reserve enough room for child focus
        // rings (`ring-2` + `ring-offset-2` = 4px each side) — `overflow-y: auto`
        // clips anything that pokes outside, so an unpadded body would crop
        // the green halo on inputs at the top/bottom edges of the scroll area.
        "min-h-0 flex-1 overflow-y-auto px-1 py-1 [overflow-wrap:anywhere]",
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
  return (
    <Button iconOnly aria-label={label} className={cn("absolute right-3 top-3", className)} onClick={onClick}>
      <span className="text-lg leading-none">×</span>
    </Button>
  );
}
