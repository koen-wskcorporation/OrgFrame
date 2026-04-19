import * as React from "react";
import { IconButton } from "@orgframe/ui/primitives/icon-button";
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

function initialsFor(value: React.ReactNode) {
  if (typeof value !== "string") {
    return "??";
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "??";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "??";
}

export function SurfaceHeader({ title, subtitle, showAvatar = false, avatarUrl = null, avatarAlt, topAction, titleId, className }: SurfaceHeaderProps) {
  const fallbackInitials = initialsFor(title);
  const avatarSizeClass = subtitle ? "h-11 w-11" : "h-9 w-9";

  return (
    <div className={cn("relative shrink-0 border-b px-5 py-4 pr-16 md:px-6", className)}>
      {topAction ? <div className="mb-2">{topAction}</div> : null}
      <div className="flex min-w-0 items-start gap-3">
        {showAvatar
          ? avatarUrl
            ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={avatarAlt ?? "Header avatar"} className={cn("aspect-square shrink-0 rounded-full border object-cover", avatarSizeClass)} src={avatarUrl} />
              )
            : (
                <span className={cn("inline-flex aspect-square shrink-0 items-center justify-center rounded-full border bg-surface-muted text-xs font-semibold text-text-muted", avatarSizeClass)}>
                  {fallbackInitials}
                </span>
              )
          : null}
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
