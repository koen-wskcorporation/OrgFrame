"use client";

import { useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { LinkPickerDialog } from "@/src/features/core/editor/buttons/LinkPickerDialog";
import type { LinkValue } from "@/src/shared/links";
import { describeLink, hrefToLinkValue, linkValueToHref } from "@/src/shared/links";

type LinkPickerFieldProps = {
  orgSlug: string;
  value: LinkValue;
  onChange: (value: LinkValue) => void;
  label?: string;
  disabled?: boolean;
};

export function LinkPickerField({
  orgSlug,
  value,
  onChange,
  label = "Link",
  disabled = false
}: LinkPickerFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <FormField label={label}>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={disabled} onClick={() => setOpen(true)} size="sm" variant="secondary">
            Choose link
          </Button>
          <p className="text-xs text-text-muted">{describeLink(value)}</p>
        </div>
      </FormField>

      <LinkPickerDialog
        onClose={() => setOpen(false)}
        onConfirm={(href) => {
          onChange(
            hrefToLinkValue(href, {
              orgSlug
            })
          );
        }}
        open={open}
        orgSlug={orgSlug}
        value={linkValueToHref(value)}
      />
    </>
  );
}
