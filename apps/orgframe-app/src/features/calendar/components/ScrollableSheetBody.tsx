"use client";

import type { ReactNode } from "react";
import { SurfaceBody } from "@orgframe/ui/primitives/surface";
import { cn } from "@orgframe/ui/primitives/utils";

type ScrollableSheetBodyProps = {
  children: ReactNode;
  className?: string;
};

export function ScrollableSheetBody({ children, className }: ScrollableSheetBodyProps) {
  return (
    <SurfaceBody className={cn("max-h-[calc(100dvh-14rem)]", className)} padded={false}>
      {children}
    </SurfaceBody>
  );
}
