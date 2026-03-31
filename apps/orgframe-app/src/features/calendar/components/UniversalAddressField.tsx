"use client";

import { AddressAutocompleteInput } from "@orgframe/ui/primitives/address-autocomplete-input";
import { FieldHint, FieldShell } from "@orgframe/ui/primitives/form-field";

type UniversalAddressFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function UniversalAddressField({
  value,
  onChange,
  disabled,
  placeholder = "Search address or enter custom location"
}: UniversalAddressFieldProps) {
  return (
    <FieldShell className="space-y-1">
      <AddressAutocompleteInput disabled={disabled} onChange={onChange} placeholder={placeholder} value={value} />
      <FieldHint className="text-[11px]">Autocomplete supports addresses and places. You can also type custom text.</FieldHint>
    </FieldShell>
  );
}
