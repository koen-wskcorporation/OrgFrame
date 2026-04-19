"use client";

import { GripVertical, Settings2, X } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";

type WidgetFrameProps = {
  title: string;
  editing: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
  onRemove?: () => void;
  onOpenSettings?: () => void;
  hasSettings?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function WidgetFrame({ title, editing, dragHandleProps, dragHandleRef, onRemove, onOpenSettings, hasSettings, children, className }: WidgetFrameProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 !px-4 !pb-3 !pt-3 md:!px-5 md:!pb-3 md:!pt-4">
        <CardTitle className="min-w-0 truncate">{title}</CardTitle>
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          {hasSettings ? (
            <Button iconOnly aria-label="Widget settings" onClick={onOpenSettings}>
              <Settings2 />
            </Button>
          ) : null}
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
              <Button iconOnly aria-label="Remove widget" onClick={onRemove}>
                <X />
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="!px-4 !pb-4 !pt-0 md:!px-5 md:!pb-5">{children}</CardContent>
    </Card>
  );
}
