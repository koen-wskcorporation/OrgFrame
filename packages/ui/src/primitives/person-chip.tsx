import * as React from "react";
import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { cn } from "./utils";

type PersonChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  name: string;
  avatarUrl?: string | null;
  metaLabel?: string;
  metaTone?: "neutral" | "success";
};

export function PersonChip({ avatarUrl, className, name, metaLabel, metaTone = "neutral", ...props }: PersonChipProps) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-full border bg-surface-muted/40 px-2 py-1", className)} {...props}>
      <Avatar alt={`${name} avatar`} name={name} sizePx={20} src={avatarUrl} />
      <span className="truncate text-xs font-medium text-text">{name}</span>
      {metaLabel ? (
        <Badge className="text-[10px]" variant={metaTone === "success" ? "success" : "neutral"}>
          {metaLabel}
        </Badge>
      ) : null}
    </span>
  );
}
