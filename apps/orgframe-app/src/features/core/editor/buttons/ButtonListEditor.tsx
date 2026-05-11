"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { ButtonWizard } from "@/src/features/core/editor/buttons/ButtonWizard";
import type { ButtonConfig } from "@/src/features/core/editor/buttons/types";
import { Button, buttonVariants } from "@orgframe/ui/primitives/button";
import { cn } from "@orgframe/ui/primitives/utils";
import { createLocalId, normalizeButtons } from "@/src/shared/links";

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

  return (
    <>
      <div className="w-full min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-text">{title}</p>
          <Button iconOnly aria-label={addButtonLabel} disabled={buttons.length >= maxButtons} onClick={openAddDialog}>
            <Plus />
          </Button>
        </div>

        {buttons.length === 0 ? (
          <p className="text-xs text-text-muted">{emptyStateText}</p>
        ) : (
          <div className="flex w-full min-w-0 flex-wrap gap-2">
            {buttons.map((button, index) => (
              <div className="flex min-w-0 max-w-full items-center overflow-hidden rounded-control border bg-surface" key={button.id}>
                <button
                  aria-label={`Edit ${button.label}`}
                  className="flex h-9 min-w-0 max-w-full items-center px-1.5 transition-colors hover:bg-surface-muted"
                  onClick={() => openEditDialog(index)}
                  type="button"
                >
                  <span
                    className={cn(
                      buttonVariants({
                        size: "sm",
                        variant: button.variant
                      }),
                      "pointer-events-none h-7 px-3 text-xs"
                    )}
                  >
                    <span className="max-w-[180px] min-w-0 truncate">{button.label}</span>
                  </span>
                </button>
                <Button iconOnly aria-label={`Remove ${button.label}`} className="h-9 w-9 border-l rounded-none" onClick={() => removeButton(index)}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeDialog ? (
        <ButtonWizard
          availableInternalLinks={availableInternalLinks}
          initialValue={activeDialog.button}
          // The wizard's mode prop matches `CreateWizard`'s "create" | "edit"
          // — "add" maps to "create" here.
          mode={activeDialog.mode === "add" ? "create" : "edit"}
          onClose={() => setActiveDialog(null)}
          onDelete={
            activeDialog.mode === "edit"
              ? () => {
                  removeButton(activeDialog.index);
                  setActiveDialog(null);
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
              buttons.map((button, index) => (index === activeDialog.index ? updated : button))
            );
            setActiveDialog(null);
          }}
          open
          orgSlug={orgSlug}
        />
      ) : null}
    </>
  );
}
