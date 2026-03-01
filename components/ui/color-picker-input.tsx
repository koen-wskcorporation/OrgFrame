"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ColorPickerInputProps = {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function sanitizeHexInput(value: string) {
  return value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toLowerCase();
}

function toSixDigitHex(rawHex: string) {
  if (rawHex.length === 6) {
    return `#${rawHex}`;
  }

  if (rawHex.length === 3) {
    return `#${rawHex[0]}${rawHex[0]}${rawHex[1]}${rawHex[1]}${rawHex[2]}${rawHex[2]}`;
  }

  return null;
}

export function ColorPickerInput({ name, defaultValue, placeholder = "00EAFF", disabled, className }: ColorPickerInputProps) {
  const pickerRef = React.useRef<HTMLInputElement | null>(null);
  const [rawHex, setRawHex] = React.useState(() => sanitizeHexInput((defaultValue ?? "").replace(/^#/, "")));

  const normalizedHex = toSixDigitHex(rawHex);
  const pickerColor = normalizedHex ?? "#00eaff";
  const submittedValue = rawHex.length === 0 ? "" : `#${rawHex}`;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-10 w-full items-center rounded-control border bg-surface pr-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas">
        <button
          aria-label="Choose accent color"
          className="ml-2 h-6 w-6 shrink-0 rounded-full border border-border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={disabled}
          onClick={() => pickerRef.current?.click()}
          style={{ backgroundColor: pickerColor }}
          type="button"
        />
        <span className="shrink-0 pl-3 text-text-muted">#</span>
        <input
          autoComplete="off"
          className="h-full w-full min-w-0 border-0 bg-transparent px-1 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none disabled:cursor-not-allowed"
          disabled={disabled}
          onChange={(event) => {
            event.currentTarget.value = sanitizeHexInput(event.currentTarget.value);
            setRawHex(event.currentTarget.value);
          }}
          pattern="^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$"
          placeholder={placeholder}
          title="Use 3 or 6 hexadecimal characters"
          value={rawHex}
        />
      </div>

      <input name={name} type="hidden" value={submittedValue} />

      <input
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const pickedHex = sanitizeHexInput(event.currentTarget.value.replace(/^#/, ""));
          setRawHex(pickedHex);
        }}
        ref={pickerRef}
        type="color"
        value={pickerColor}
      />
    </div>
  );
}
