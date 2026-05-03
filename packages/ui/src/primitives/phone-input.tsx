"use client";

import * as React from "react";
import { Input } from "./input";

// Accepts +1 followed by 10 digits, displayed as "+1 XXX XXX-XXXX".
const PHONE_PATTERN = "\\+1 \\d{3} \\d{3}-\\d{4}";

export function formatPhoneNumber(raw: string): string {
  // Keep only digits; treat any leading "1" as the country code.
  const digits = raw.replace(/\D/g, "");
  const trimmed = digits.startsWith("1") ? digits.slice(1) : digits;
  const truncated = trimmed.slice(0, 10);

  if (truncated.length === 0) return "";
  if (truncated.length <= 3) return `+1 ${truncated}`;
  if (truncated.length <= 6) return `+1 ${truncated.slice(0, 3)} ${truncated.slice(3)}`;
  return `+1 ${truncated.slice(0, 3)} ${truncated.slice(3, 6)}-${truncated.slice(6)}`;
}

export function isCompletePhoneNumber(value: string) {
  return /^\+1 \d{3} \d{3}-\d{4}$/.test(value);
}

type PhoneInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (formatted: string) => void;
};

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  {
    value,
    onChange,
    autoComplete = "tel",
    inputMode = "tel",
    pattern = PHONE_PATTERN,
    placeholder = "+1 555 123-4567",
    maxLength = 16,
    ...rest
  },
  ref
) {
  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(formatPhoneNumber(event.target.value));
    },
    [onChange]
  );

  return (
    <Input
      ref={ref}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      onChange={handleChange}
      pattern={pattern}
      placeholder={placeholder}
      type="tel"
      value={value}
      {...rest}
    />
  );
});
