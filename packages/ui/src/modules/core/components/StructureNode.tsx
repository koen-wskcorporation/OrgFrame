"use client";

import { Copy, Lock, Settings2, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@orgframe/ui/ui/button";
import { Popover } from "@orgframe/ui/ui/popover";

export type StructureNodeProps = {
  nodeId?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  selected?: boolean;
  focused?: boolean;
  conflicted?: boolean;
  structural?: boolean;
  movementLocked?: boolean;
  sizeLocked?: boolean;
  draggable?: boolean;
  dragHandleProps?: {
    attributes?: Record<string, unknown>;
    listeners?: Record<string, unknown>;
  };
  quickActions?: {
    onEdit?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    canEdit?: boolean;
    canDuplicate?: boolean;
    canDelete?: boolean;
  };
  forceSingleLine?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerEnter?: React.PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  children?: ReactNode;
};

export function StructureNode({
  nodeId,
  title,
  subtitle,
  chips,
  selected = false,
  focused = false,
  conflicted = false,
  structural = false,
  movementLocked = false,
  sizeLocked = false,
  draggable = false,
  dragHandleProps,
  quickActions,
  forceSingleLine = false,
  className,
  style,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  children
}: StructureNodeProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionAnchorRef = useRef<HTMLDivElement | null>(null);
  const actionPointerAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [actionPointer, setActionPointer] = useState<{ x: number; y: number } | null>(null);
  const hasQuickActions = Boolean(quickActions && (quickActions.onEdit || quickActions.onDuplicate || quickActions.onDelete));

  return (
    <>
      <div
        className={cn(
          "rounded-control border bg-surface px-2 py-1 shadow-sm transition-[left,top,width,height,transform,box-shadow,border-color,background-color] duration-100 ease-out",
          "hover:-translate-y-[1px] hover:shadow-floating",
          selected ? "border-accent bg-accent/10" : structural ? "border-dashed border-border/80 bg-surface/70" : "border-border",
          focused ? "ring-2 ring-accent/60" : "",
          conflicted ? "border-destructive/70 bg-destructive/10" : "",
          className
        )}
        data-canvas-pan-ignore="true"
        data-structure-node-id={nodeId}
        onClick={(event) => {
          onClick?.(event);
          if (hasQuickActions) {
            setActionPointer({
              x: Math.round(event.clientX + 10),
              y: Math.round(event.clientY + 10)
            });
            setActionsOpen(true);
          }
        }}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        ref={actionAnchorRef}
        style={style}
        {...(draggable ? (dragHandleProps?.attributes ?? {}) : {})}
        {...(draggable ? (dragHandleProps?.listeners ?? {}) : {})}
      >
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-none flex h-full w-full items-center justify-center" data-canvas-pan-ignore="true">
          <div className="group relative inline-flex max-w-[86%] items-center rounded-full border border-border/70 bg-surface/95 px-4 py-1.5 text-center shadow-sm">
            <div className="min-w-0 px-1.5 text-center">
              {forceSingleLine ? (
                <span className="flex w-full max-w-[22rem] items-center justify-center gap-2">
                  <span className="min-w-0 truncate text-center text-xs font-semibold text-text" title={typeof title === "string" ? title : undefined}>
                    {title}
                  </span>
                  {chips ? <span className="flex flex-nowrap items-center gap-1 overflow-hidden [&>*]:shrink-0">{chips}</span> : null}
                </span>
              ) : (
                <span className="flex min-w-0 w-full max-w-[16rem] flex-col items-center leading-tight">
                  <span className="block w-full truncate text-center text-xs font-semibold text-text" title={typeof title === "string" ? title : undefined}>
                    {title}
                  </span>
                  {subtitle ? <span className="block w-full truncate text-center text-[11px] text-text-muted">{subtitle}</span> : null}
                  {chips ? <span className="mt-1 flex flex-wrap items-center justify-center gap-1">{chips}</span> : null}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

        {(movementLocked || sizeLocked) ? (
          <span className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-control border bg-surface/95 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
            <Lock className="h-3 w-3" />
            Locked
          </span>
        ) : null}

        {hasQuickActions ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none fixed h-px w-px"
              ref={actionPointerAnchorRef}
              style={
                actionPointer
                  ? {
                      left: `${actionPointer.x}px`,
                      top: `${actionPointer.y}px`
                    }
                  : {
                      left: "-9999px",
                      top: "-9999px"
                    }
              }
            />
            <Popover
              anchorRef={actionPointer ? actionPointerAnchorRef : actionAnchorRef}
              className="w-auto rounded-[999px] border border-border/70 bg-surface/95 p-1 shadow-floating backdrop-blur animate-in fade-in zoom-in-95 duration-150 ease-out"
              offset={6}
              onClose={() => {
                setActionsOpen(false);
                setActionPointer(null);
              }}
              open={actionsOpen}
              placement="bottom-start"
            >
              <div className="flex items-center gap-1">
                {quickActions?.onEdit ? (
                  <Button
                    aria-label="Edit node"
                    className="h-8 w-8 rounded-full p-0"
                    disabled={quickActions.canEdit === false}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActionsOpen(false);
                      setActionPointer(null);
                      quickActions.onEdit?.();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                ) : null}
                {quickActions?.onDuplicate ? (
                  <Button
                    aria-label="Duplicate node"
                    className="h-8 w-8 rounded-full p-0"
                    disabled={quickActions.canDuplicate === false}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActionsOpen(false);
                      setActionPointer(null);
                      quickActions.onDuplicate?.();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                ) : null}
                {quickActions?.onDelete ? (
                  <Button
                    aria-label="Delete node"
                    className="h-8 w-8 rounded-full p-0 text-danger"
                    disabled={quickActions.canDelete === false}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActionsOpen(false);
                      setActionPointer(null);
                      quickActions.onDelete?.();
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </Popover>
          </>
        ) : null}

        {children}
      </div>
    </>
  );
}
