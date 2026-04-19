"use client";

import type { ReactNode } from "react";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { cn } from "@orgframe/ui/primitives/utils";

type PeopleSidebarHeaderIdentityProps = {
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  leadingAction?: ReactNode;
  className?: string;
};

export function PeopleSidebarHeaderIdentity({ name, subtitle, avatarUrl, leadingAction, className }: PeopleSidebarHeaderIdentityProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {leadingAction ? <div className="w-full">{leadingAction}</div> : null}
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar alt={`${name} avatar`} name={name} sizePx={32} src={avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight text-text">{name}</p>
          {subtitle ? <p className="truncate text-xs text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
