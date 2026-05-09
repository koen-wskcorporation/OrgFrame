"use client";

import { useCallback, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@orgframe/ui/primitives/button";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import type { DashboardLayout, WidgetInstance } from "@/src/features/manage-dashboard/types";
import { WidgetFrame } from "@/src/features/manage-dashboard/components/WidgetFrame";
import { MetricCardWizard, type MetricCardWizardResult } from "@/src/features/manage-dashboard/components/MetricCardWizard";
import { renderWidget } from "@/src/features/manage-dashboard/widgets/client-components";
import { widgetMetadata } from "@/src/features/manage-dashboard/widgets/metadata";

export type WidgetInitialData = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

type ManageDashboardClientProps = {
  orgSlug: string;
  initialLayout: DashboardLayout;
  initialData: Record<string, WidgetInitialData>;
};

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `metric-card-${crypto.randomUUID().slice(0, 8)}`
    : `metric-card-${Math.random().toString(16).slice(2, 10)}`;
}

function SortableCard({
  widget,
  data,
  orgSlug,
  dragAttributes,
  dragListeners,
  setActivatorNodeRef,
  onRemove
}: {
  widget: WidgetInstance;
  data: WidgetInitialData | undefined;
  orgSlug: string;
  dragAttributes: ReturnType<typeof useSortable>["attributes"];
  dragListeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
  onRemove: () => void;
}) {
  const meta = widgetMetadata[widget.type];
  const resolvedData: WidgetInitialData = data ?? { ok: true, data: null };
  const customLabel = typeof widget.settings?.label === "string" ? (widget.settings.label as string).trim() : "";
  const title = customLabel.length > 0 ? customLabel : meta.title;

  return (
    <WidgetFrame
      dragHandleProps={{ ...dragAttributes, ...dragListeners }}
      dragHandleRef={setActivatorNodeRef}
      editing
      hasSettings={false}
      onRemove={onRemove}
      title={title}
    >
      {renderWidget(widget.type, { orgSlug, settings: widget.settings, data: resolvedData })}
    </WidgetFrame>
  );
}

function DraggableSlot({
  widget,
  data,
  orgSlug,
  onRemove
}: {
  widget: WidgetInstance;
  data: WidgetInitialData | undefined;
  orgSlug: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SortableCard
        data={data}
        dragAttributes={attributes}
        dragListeners={listeners}
        onRemove={onRemove}
        orgSlug={orgSlug}
        setActivatorNodeRef={setActivatorNodeRef}
        widget={widget}
      />
    </div>
  );
}

export function ManageDashboardClient({ orgSlug, initialLayout, initialData }: ManageDashboardClientProps) {
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout);
  const [dataByWidget, setDataByWidget] = useState<Record<string, WidgetInitialData>>(initialData);
  const [wizardOpen, setWizardOpen] = useState(false);
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

  const fetchWidgetData = useCallback(
    async (id: string, settings: Record<string, unknown>) => {
      try {
        const response = await fetch(
          `/api/manage-dashboard/widget-data?orgSlug=${encodeURIComponent(orgSlug)}&type=metric-card`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings })
          }
        );
        if (response.ok) {
          const payload = (await response.json()) as WidgetInitialData;
          setDataByWidget((current) => ({ ...current, [id]: payload }));
        }
      } catch {
        // ignore — card will show "—"
      }
    },
    [orgSlug]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLayout((current) => {
      const oldIndex = current.widgets.findIndex((w) => w.id === active.id);
      const newIndex = current.widgets.findIndex((w) => w.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      const next: DashboardLayout = { ...current, widgets: arrayMove(current.widgets, oldIndex, newIndex) };
      persist(next);
      return next;
    });
  }, [persist]);

  const handleWizardFinish = useCallback((result: MetricCardWizardResult) => {
    const id = createId();
    const settings = { source: result.source, label: result.label };
    const widget: WidgetInstance = { id, type: "metric-card", settings };
    setLayout((current) => {
      const next: DashboardLayout = { ...current, widgets: [...current.widgets, widget] };
      persist(next);
      return next;
    });
    setWizardOpen(false);
    void fetchWidgetData(id, settings);
  }, [fetchWidgetData, persist]);

  const removeWidget = useCallback((id: string) => {
    setLayout((current) => {
      const next: DashboardLayout = { ...current, widgets: current.widgets.filter((w) => w.id !== id) };
      persist(next);
      return next;
    });
    setDataByWidget((current) => {
      const { [id]: _omit, ...rest } = current;
      return rest;
    });
  }, [persist]);

  const headerActions = (
    <Button intent="add" object="Card" onClick={() => setWizardOpen(true)} />
  );

  return (
    <PageShell
      actions={headerActions}
      description="Overview of your organization's activity and quick links to management tools."
      title="Dashboard"
    >
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <SortableContext items={layout.widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {layout.widgets.map((widget) => (
              <DraggableSlot
                data={dataByWidget[widget.id]}
                key={widget.id}
                onRemove={() => removeWidget(widget.id)}
                orgSlug={orgSlug}
                widget={widget}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <MetricCardWizard
        onClose={() => setWizardOpen(false)}
        onFinish={handleWizardFinish}
        open={wizardOpen}
      />
    </PageShell>
  );
}
