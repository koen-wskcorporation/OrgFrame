"use client";

import { Plus } from "lucide-react";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Button } from "@orgframe/ui/primitives/button";
import type { WidgetType } from "@/src/features/manage-dashboard/types";
import { widgetMetadata } from "@/src/features/manage-dashboard/widgets/metadata";

type WidgetPickerDialogProps = {
  open: boolean;
  onClose: () => void;
  availableTypes: WidgetType[];
  onAdd: (type: WidgetType) => void;
};

export function WidgetPickerDialog({ open, onClose, availableTypes, onAdd }: WidgetPickerDialogProps) {
  return (
    <Popup onClose={onClose} open={open} size="lg" subtitle="Pick a card to add to your dashboard." title="Add a widget">
      {availableTypes.length === 0 ? (
        <p className="text-sm text-text-muted">No additional widgets available for your permissions.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {availableTypes.map((type) => {
            const meta = widgetMetadata[type];
            return (
              <button
                className="flex flex-col items-start gap-1 rounded-card border bg-canvas p-3 text-left hover:border-accent hover:bg-surface-muted"
                key={type}
                onClick={() => {
                  onAdd(type);
                  onClose();
                }}
                type="button"
              >
                <span className="text-sm font-semibold text-text-strong">{meta.title}</span>
                <span className="text-xs text-text-muted">{meta.description}</span>
              </button>
            );
          })}
        </div>
      )}
    </Popup>
  );
}

export function AddWidgetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} size="sm" type="button" variant="secondary">
      <Plus className="h-4 w-4" /> Add Widget
    </Button>
  );
}
