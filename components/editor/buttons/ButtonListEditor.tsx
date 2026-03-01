"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ButtonConfigDialog } from "@/components/editor/buttons/ButtonConfigDialog";
import { buttonVariantLabelByValue, type ButtonConfig } from "@/components/editor/buttons/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createLocalId, normalizeButtons } from "@/lib/links";

type ButtonListEditorProps = {
  value: ButtonConfig[];
  onChange: (next: ButtonConfig[]) => void;
  orgSlug?: string;
  availableInternalLinks?: Array<{ label: string; value: string }>;
  maxButtons?: number;
  title?: string;
  addButtonLabel?: string;
  emptyStateText?: string;
};

type ActiveDialogState =
  | {
      mode: "add";
      button: ButtonConfig;
    }
  | {
      mode: "edit";
      index: number;
      button: ButtonConfig;
    }
  | null;

function createDefaultButton(): ButtonConfig {
  return {
    id: createLocalId(),
    label: "New button",
    href: "/",
    variant: "primary",
    newTab: false
  };
}

export function ButtonListEditor({
  value,
  onChange,
  orgSlug,
  availableInternalLinks = [],
  maxButtons = 4,
  title = "Buttons",
  addButtonLabel = "Add button",
  emptyStateText = "No buttons yet."
}: ButtonListEditorProps) {
  const buttons = useMemo(() => normalizeButtons(value, { max: maxButtons }), [maxButtons, value]);
  const [activeDialog, setActiveDialog] = useState<ActiveDialogState>(null);

  function apply(next: ButtonConfig[]) {
    onChange(normalizeButtons(next, { max: maxButtons }));
  }

  function openAddDialog() {
    setActiveDialog({
      mode: "add",
      button: createDefaultButton()
    });
  }

  function openEditDialog(index: number) {
    const button = buttons[index];

    if (!button) {
      return;
    }

    setActiveDialog({
      mode: "edit",
      index,
      button
    });
  }

  function removeButton(index: number) {
    apply(buttons.filter((_, currentIndex) => currentIndex !== index));
    setActiveDialog((currentDialog) => {
      if (!currentDialog || currentDialog.mode !== "edit") {
        return currentDialog;
      }

      if (currentDialog.index === index) {
        return null;
      }

      if (currentDialog.index > index) {
        return {
          ...currentDialog,
          index: currentDialog.index - 1
        };
      }

      return currentDialog;
    });
  }

  function moveButton(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= buttons.length) {
      return;
    }

    const next = [...buttons];
    const current = next[index];
    const target = next[targetIndex];

    if (!current || !target) {
      return;
    }

    next[index] = target;
    next[targetIndex] = current;
    apply(next);

    setActiveDialog((currentDialog) => {
      if (!currentDialog || currentDialog.mode !== "edit") {
        return currentDialog;
      }

      if (currentDialog.index !== index) {
        return currentDialog;
      }

      return {
        ...currentDialog,
        index: targetIndex
      };
    });
  }

  return (
    <>
      <div className="w-full min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text">{title}</p>
          <Button disabled={buttons.length >= maxButtons} onClick={openAddDialog} size="sm" variant="secondary">
            {addButtonLabel}
          </Button>
        </div>

        {buttons.length === 0 ? (
          <p className="text-xs text-text-muted">{emptyStateText}</p>
        ) : (
          <div className="flex w-full min-w-0 flex-wrap gap-2">
            {buttons.map((button, index) => (
              <div className="flex min-w-0 max-w-full items-center overflow-hidden rounded-control border bg-surface" key={button.id}>
                <button
                  className={cn(
                    "flex h-9 min-w-0 max-w-full items-center gap-2 px-3 text-left text-xs font-semibold text-text transition-colors hover:bg-surface-muted",
                    button.variant === "link" ? "underline underline-offset-2" : undefined
                  )}
                  onClick={() => openEditDialog(index)}
                  type="button"
                >
                  <span className="max-w-[180px] min-w-0 truncate">{button.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{buttonVariantLabelByValue[button.variant]}</span>
                </button>
                <button
                  aria-label={`Remove ${button.label}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center border-l text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                  onClick={() => removeButton(index)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeDialog ? (
        <ButtonConfigDialog
          canMoveDown={activeDialog.mode === "edit" ? activeDialog.index < buttons.length - 1 : false}
          canMoveUp={activeDialog.mode === "edit" ? activeDialog.index > 0 : false}
          initialValue={activeDialog.button}
          mode={activeDialog.mode}
          onClose={() => setActiveDialog(null)}
          onDelete={
            activeDialog.mode === "edit"
              ? () => {
                  removeButton(activeDialog.index);
                }
              : undefined
          }
          onMoveDown={
            activeDialog.mode === "edit"
              ? () => {
                  moveButton(activeDialog.index, 1);
                }
              : undefined
          }
          onMoveUp={
            activeDialog.mode === "edit"
              ? () => {
                  moveButton(activeDialog.index, -1);
                }
              : undefined
          }
          onSave={(updated) => {
            if (activeDialog.mode === "add") {
              apply([...buttons, updated]);
              setActiveDialog(null);
              return;
            }

            apply(
              buttons.map((button, index) => {
                if (index !== activeDialog.index) {
                  return button;
                }

                return updated;
              })
            );

            setActiveDialog(null);
          }}
          open
          availableInternalLinks={availableInternalLinks}
          orgSlug={orgSlug}
        />
      ) : null}
    </>
  );
}
