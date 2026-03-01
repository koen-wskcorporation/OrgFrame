"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { LinkPickerDialog } from "@/components/editor/buttons/LinkPickerDialog";
import { buttonVariantOptions, type ButtonConfig } from "@/components/editor/buttons/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EditorSettingsDialog } from "@/components/shared/EditorSettingsDialog";
import { describeButtonHref, isExternalHref } from "@/lib/links";

type ButtonConfigDialogProps = {
  open: boolean;
  mode: "add" | "edit";
  initialValue: ButtonConfig;
  onClose: () => void;
  onSave: (next: ButtonConfig) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  orgSlug?: string;
  availableInternalLinks?: Array<{ label: string; value: string }>;
};

type ValidationState = {
  label?: string;
  href?: string;
};

function normalizeInternalPath(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "/";
  }

  if (trimmed === "/") {
    return "/";
  }

  return `/${trimmed.replace(/^\/+/, "")}`;
}

export function ButtonConfigDialog({
  open,
  mode,
  initialValue,
  onClose,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  orgSlug,
  availableInternalLinks = []
}: ButtonConfigDialogProps) {
  const [draft, setDraft] = useState<ButtonConfig>(initialValue);
  const [errors, setErrors] = useState<ValidationState>({});
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(initialValue);
    setErrors({});
  }, [initialValue, open]);

  function handleSave() {
    const nextErrors: ValidationState = {};
    const label = draft.label.trim();
    const href = draft.href.trim();

    if (!label) {
      nextErrors.label = "Text is required.";
    }

    if (!href) {
      nextErrors.href = "Link is required.";
    }

    if (href && isExternalHref(href) && !/^https?:\/\//i.test(href)) {
      nextErrors.href = "External URL must start with http:// or https://";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSave({
      ...draft,
      label,
      href: isExternalHref(href) ? href : normalizeInternalPath(href)
    });
  }

  const linkDescription = describeButtonHref(draft.href);

  return (
    <>
      <EditorSettingsDialog
        contentClassName="space-y-4"
        description={mode === "add" ? "Configure a new button." : "Update this button."}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {mode === "edit" && onDelete ? (
                <Button onClick={onDelete} size="sm" variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}

              {mode === "edit" && onMoveUp ? (
                <Button disabled={!canMoveUp} onClick={onMoveUp} size="sm" variant="ghost">
                  <ArrowUp className="h-4 w-4" />
                  Move up
                </Button>
              ) : null}

              {mode === "edit" && onMoveDown ? (
                <Button disabled={!canMoveDown} onClick={onMoveDown} size="sm" variant="ghost">
                  <ArrowDown className="h-4 w-4" />
                  Move down
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onClose} size="sm" variant="ghost">
                Cancel
              </Button>
              <Button onClick={handleSave} size="sm">
                Save button
              </Button>
            </div>
          </div>
        }
        onClose={onClose}
        open={open}
        title={mode === "add" ? "Add button" : "Edit button"}
      >
        <FormField error={errors.label} label="Text">
          <Input
            maxLength={64}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                label: event.target.value
              }));

              setErrors((current) => ({
                ...current,
                label: undefined
              }));
            }}
            placeholder="Button label"
            value={draft.label}
          />
        </FormField>

        <FormField error={errors.href} label="Link">
          <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button onClick={() => setLinkPickerOpen(true)} size="sm" variant="secondary">
                Pick link
              </Button>
              <p className="min-w-0 break-words text-xs text-text-muted [overflow-wrap:anywhere]">{linkDescription}</p>
            </div>
            <Input
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  href: event.target.value
                }));

                setErrors((current) => ({
                  ...current,
                  href: undefined
                }));
              }}
              placeholder="/about or https://example.com"
              value={draft.href}
            />
          </div>
        </FormField>

        <FormField label="Style">
          <Select
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                variant: event.target.value as ButtonConfig["variant"]
              }));
            }}
            options={buttonVariantOptions}
            value={draft.variant}
          />
        </FormField>

        <FormField label="Open in new tab">
          <label className="inline-flex h-10 items-center gap-2 rounded-control border bg-surface px-3 text-sm">
            <Checkbox
              checked={Boolean(draft.newTab)}
              onChange={(event) => {
                const checked = event.target.checked;
                setDraft((current) => ({
                  ...current,
                  newTab: checked
                }));
              }}
            />
            Open link in a new browser tab
          </label>
        </FormField>

        {errors.href || errors.label ? <Alert variant="destructive">Please fix the highlighted fields.</Alert> : null}
      </EditorSettingsDialog>

      <LinkPickerDialog
        availableInternalLinks={availableInternalLinks}
        onClose={() => setLinkPickerOpen(false)}
        onConfirm={(href) => {
          setDraft((current) => ({
            ...current,
            href
          }));
          setErrors((current) => ({
            ...current,
            href: undefined
          }));
        }}
        open={linkPickerOpen}
        orgSlug={orgSlug}
        value={draft.href}
      />
    </>
  );
}
