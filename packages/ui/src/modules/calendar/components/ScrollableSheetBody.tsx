"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ScrollableSheetBodyProps = {
  children: ReactNode;
  className?: string;
};

export function ScrollableSheetBody({ children, className }: ScrollableSheetBodyProps) {
  return <div className={cn("min-h-0 max-h-[calc(100dvh-14rem)] overflow-y-auto", className)}>{children}</div>;
}
