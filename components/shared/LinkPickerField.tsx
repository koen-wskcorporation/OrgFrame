"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { LinkPickerDialog } from "@/components/editor/buttons/LinkPickerDialog";
import type { LinkValue } from "@/lib/links";
import { describeLink, hrefToLinkValue, linkValueToHref } from "@/lib/links";

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
