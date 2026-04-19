"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Panel } from "@orgframe/ui/primitives/panel";
import type { DashboardLayout, WidgetInstance, WidgetType } from "@/src/features/manage-dashboard/types";
import { widgetTypes } from "@/src/features/manage-dashboard/types";
import { WidgetFrame } from "@/src/features/manage-dashboard/components/WidgetFrame";
import { WidgetPickerDialog } from "@/src/features/manage-dashboard/components/WidgetPickerDialog";
import { renderWidget, renderWidgetSettings, widgetHasSettings } from "@/src/features/manage-dashboard/widgets/client-components";
import { widgetMetadata } from "@/src/features/manage-dashboard/widgets/metadata";

export type WidgetInitialData = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

type ManageDashboardCanvasProps = {
  orgSlug: string;
  initialLayout: DashboardLayout;
  initialData: Record<string, WidgetInitialData>;
  availableWidgetTypes: WidgetType[];
};

function createId(type: WidgetType) {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  return `${type}-${rand}`;
}

function SortableWidget({
  widget,
  editing,
  orgSlug,
  data,
  onRemove,
  onOpenSettings,
  onUpdateSettings
}: {
  widget: WidgetInstance;
  editing: boolean;
  orgSlug: string;
  data: WidgetInitialData | undefined;
  onRemove: () => void;
  onOpenSettings: () => void;
  onUpdateSettings: (settings: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const meta = widgetMetadata[widget.type];
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1
  } as React.CSSProperties;
  const colSpanClass = meta.colSpan === "full" ? "md:col-span-2 xl:col-span-3" : "";
  const resolvedData: WidgetInitialData = data ?? { ok: true, data: null };

  return (
    <div className={colSpanClass} ref={setNodeRef} style={style}>
      <WidgetFrame
        dragHandleProps={editing ? { ...attributes, ...listeners } : undefined}
        dragHandleRef={editing ? setActivatorNodeRef : undefined}
        editing={editing}
        hasSettings={widgetHasSettings(widget.type)}
        onOpenSettings={onOpenSettings}
        onRemove={onRemove}
        title={meta.title}
      >
        {renderWidget(widget.type, {
          orgSlug,
          settings: widget.settings,
          data: resolvedData,
          onUpdateSettings
        })}
      </WidgetFrame>
    </div>
  );
}

export function ManageDashboardCanvas({ orgSlug, initialLayout, initialData, availableWidgetTypes }: ManageDashboardCanvasProps) {
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout);
  const editing = true;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsWidgetId, setSettingsWidgetId] = useState<string | null>(null);
  const [dataByWidget, setDataByWidget] = useState<Record<string, WidgetInitialData>>(initialData);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const saveTimer = useRef<number | null>(null);

  const persist = useCallback((next: DashboardLayout) => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      void fetch(`/api/manage-dashboard/layout?orgSlug=${encodeURIComponent(orgSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: next })
      });
    }, 400);
  }, [orgSlug]);

  const updateLayout = useCallback((next: DashboardLayout) => {
    setLayout(next);
    persist(next);
  }, [persist]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.widgets.findIndex((w) => w.id === active.id);
    const newIndex = layout.widgets.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    updateLayout({ ...layout, widgets: arrayMove(layout.widgets, oldIndex, newIndex) });
  }, [layout, updateLayout]);

  const addWidget = useCallback(async (type: WidgetType) => {
    const id = createId(type);
    const next: DashboardLayout = { ...layout, widgets: [...layout.widgets, { id, type }] };
    updateLayout(next);
    try {
      const response = await fetch(`/api/manage-dashboard/widget-data?orgSlug=${encodeURIComponent(orgSlug)}&type=${encodeURIComponent(type)}`);
      if (response.ok) {
        const payload = (await response.json()) as WidgetInitialData;
        setDataByWidget((current) => ({ ...current, [id]: payload }));
      }
    } catch {
      // keep silent; widget renders with null data
    }
  }, [layout, orgSlug, updateLayout]);

  const removeWidget = useCallback((id: string) => {
    updateLayout({ ...layout, widgets: layout.widgets.filter((w) => w.id !== id) });
    setDataByWidget((current) => {
      const { [id]: _, ...rest } = current;
      return rest;
    });
  }, [layout, updateLayout]);

  const updateWidgetSettings = useCallback((id: string, settings: Record<string, unknown>) => {
    updateLayout({
      ...layout,
      widgets: layout.widgets.map((w) => (w.id === id ? { ...w, settings } : w))
    });
  }, [layout, updateLayout]);

  const availableToAdd = useMemo(() => {
    const usedTypes = new Set(layout.widgets.map((w) => w.type));
    return availableWidgetTypes.filter((type) => {
      // Allow duplicates only for quick-links (user-curated) — all others single-instance for v1
      if (type === "quick-links") return true;
      return !usedTypes.has(type);
    });
  }, [availableWidgetTypes, layout.widgets]);

  return (
    <div className="flex flex-col gap-3">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <SortableContext items={layout.widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {layout.widgets.map((widget) => (
              <SortableWidget
                data={dataByWidget[widget.id]}
                editing={editing}
                key={widget.id}
                onOpenSettings={() => setSettingsWidgetId(widget.id)}
                onRemove={() => removeWidget(widget.id)}
                onUpdateSettings={(settings) => updateWidgetSettings(widget.id, settings)}
                orgSlug={orgSlug}
                widget={widget}
              />
            ))}
            <AddWidgetBlock
              disabled={availableToAdd.length === 0}
              onClick={() => setPickerOpen(true)}
            />
          </div>
        </SortableContext>
      </DndContext>

      <WidgetPickerDialog
        availableTypes={availableToAdd}
        onAdd={(type) => void addWidget(type)}
        onClose={() => setPickerOpen(false)}
        open={pickerOpen}
      />

      {(() => {
        const active = settingsWidgetId ? layout.widgets.find((w) => w.id === settingsWidgetId) : null;
        const meta = active ? widgetMetadata[active.type] : null;
        return (
          <Panel
            onClose={() => setSettingsWidgetId(null)}
            open={Boolean(active)}
            subtitle={meta?.description}
            title={meta ? `${meta.title} settings` : "Widget settings"}
          >
            {active
              ? renderWidgetSettings(active.type, {
                  orgSlug,
                  settings: active.settings,
                  data: dataByWidget[active.id] ?? { ok: true, data: null },
                  onUpdateSettings: (next) => updateWidgetSettings(active.id, next)
                })
              : null}
          </Panel>
        );
      })()}
    </div>
  );
}

function AddWidgetBlock({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-[180px] w-full items-center justify-center rounded-card border-2 border-dashed border-border/70 p-6">
      <Button disabled={disabled} onClick={onClick} size="sm" type="button" variant="secondary">
        <Plus className="h-4 w-4" />
        {disabled ? "All Widgets Added" : "Add Widget"}
      </Button>
    </div>
  );
}

export const allWidgetTypes = widgetTypes;
