"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type InlineEditableTextProps = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  onActivate?: () => void;
  onCommit: (nextValue: string) => void;
};

export function InlineEditableText({ value, placeholder, disabled = false, className, onActivate, onCommit }: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function commitEdit() {
    onCommit(draft);
    setIsEditing(false);
  }

  function cancelEdit() {
    setDraft(value);
    setIsEditing(false);
  }

  if (isEditing && !disabled) {
    return (
      <div className="relative inline-block max-w-full align-top">
        <input
          className={cn(
            "inline-block w-auto max-w-full border-0 bg-transparent p-0 text-sm font-semibold leading-normal text-text outline-none",
            "focus-visible:ring-0 focus-visible:outline-none",
            className
          )}
          onBlur={commitEdit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitEdit();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelEdit();
            }
          }}
          ref={inputRef}
          size={Math.max(1, draft.length)}
          value={draft}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0 border-b border-dotted border-text-muted/50"
        />
      </div>
    );
  }

  return (
    <button
      className={cn("inline-block max-w-full cursor-text p-0 text-left text-sm font-semibold text-text", className)}
      disabled={disabled}
      onClick={() => {
        onActivate?.();
        if (!disabled) {
          setIsEditing(true);
        }
      }}
      type="button"
    >
      {value || placeholder}
    </button>
  );
}
