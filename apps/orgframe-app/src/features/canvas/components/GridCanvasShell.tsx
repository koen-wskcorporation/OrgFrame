import { CANVAS_GRID_SIZE, CANVAS_HEIGHT, CANVAS_WIDTH } from "@/src/features/canvas/core/constants";

export function GridCanvasShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-auto rounded-control border border-border bg-surface">
      <div
        className="relative"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.28) 1px, transparent 1px)`,
          backgroundSize: `${CANVAS_GRID_SIZE}px ${CANVAS_GRID_SIZE}px`
        }}
      >
        {children}
      </div>
    </div>
  );
}
