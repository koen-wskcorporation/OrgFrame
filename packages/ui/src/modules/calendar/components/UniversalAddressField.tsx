"use client";

import { AddressAutocompleteInput } from "@orgframe/ui/ui/address-autocomplete-input";

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
    <div className="space-y-1">
      <AddressAutocompleteInput disabled={disabled} onChange={onChange} placeholder={placeholder} value={value} />
      <p className="text-[11px] text-text-muted">Autocomplete supports addresses and places. You can also type custom text.</p>
    </div>
  );
}
