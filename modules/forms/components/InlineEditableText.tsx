"use client";

import { Input } from "@/components/ui/input";

type InlineEditableTextProps = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  onActivate?: () => void;
  onCommit: (nextValue: string) => void;
};

export function InlineEditableText({ value, placeholder, disabled = false, className, onActivate, onCommit }: InlineEditableTextProps) {
  return (
    <Input
      className={className}
      disabled={disabled}
      inline
      inlinePlaceholder={placeholder}
      onInlineActivate={onActivate}
      onInlineCommit={onCommit}
      value={value}
    />
  );
}
