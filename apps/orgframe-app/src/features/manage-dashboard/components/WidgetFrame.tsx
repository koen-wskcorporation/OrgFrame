"use client";

import { GripVertical, Settings2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";

type WidgetFrameProps = {
  title: string;
  editing: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
  onOpenSettings?: () => void;
  children: React.ReactNode;
  className?: string;
};

// All dashboard cards share this fixed height so the grid stays uniform
// regardless of widget content size.
const CARD_HEIGHT = "h-[124px]";

export function WidgetFrame({ title, editing, dragHandleProps, dragHandleRef, onOpenSettings, children, className }: WidgetFrameProps) {
  return (
    <Card className={`${CARD_HEIGHT} flex flex-col ${className ?? ""}`.trim()}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 !px-4 !pb-2 !pt-4 md:!px-5 md:!pb-2 md:!pt-4">
        <CardTitle className="min-w-0 truncate">{title}</CardTitle>
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          {editing ? (
            <>
              <Button
                iconOnly
                aria-label="Drag to reorder"
                ref={dragHandleRef}
                {...dragHandleProps}
              >
                <GripVertical />
              </Button>
              <Button iconOnly aria-label="Manage card" onClick={onOpenSettings}>
                <Settings2 />
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden !px-4 !pb-4 !pt-0 md:!px-5 md:!pb-5">
        {children}
      </CardContent>
    </Card>
  );
}
