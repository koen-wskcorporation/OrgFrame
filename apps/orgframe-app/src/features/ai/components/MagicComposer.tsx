"use client";

import { useEffect, useRef, type RefObject } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { ChipButton } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { cn } from "@orgframe/ui/primitives/utils";

type MagicComposerProps = {
  inputId?: string;
  inputRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  suggestions?: string[];
  compact?: boolean;
  className?: string;
};

export function MagicComposer({
  inputId,
  inputRef,
  value,
  onChange,
  onSubmit,
  disabled = false,
  loading = false,
  placeholder,
  suggestions = [],
  compact = false,
  className
}: MagicComposerProps) {
  const localRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const textareaRef = inputRef ?? localRef;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    if (compact) {
      element.style.removeProperty("height");
      return;
    }

    element.style.height = "0px";
    const nextHeight = Math.max(40, Math.min(140, element.scrollHeight));
    element.style.height = `${nextHeight}px`;
  }, [compact, value]);

  return (
    <div className={cn(compact ? "relative" : "rounded-card border bg-surface shadow-sm", className)}>
      {compact ? (
        <div className="relative">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="h-10 rounded-full bg-surface pl-9 pr-12 shadow-sm"
            disabled={disabled || loading}
            id={inputId}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={placeholder}
            ref={(node) => {
              textareaRef.current = node;
            }}
            value={value}
          />
          <Button
            className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full p-0"
            disabled={!value.trim()}
            loading={loading}
            onClick={onSubmit}
            size="sm"
            type="button"
            variant="secondary"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Sparkles className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted" />
          <Textarea
            className="min-h-[40px] resize-none border-0 bg-transparent py-2 pl-9 pr-12"
            disabled={disabled || loading}
            id={inputId}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder={placeholder}
            ref={(node) => {
              textareaRef.current = node;
            }}
            rows={1}
            value={value}
          />
          <Button
            className="absolute bottom-2 right-2 h-7 w-7 rounded-full p-0"
            disabled={!value.trim()}
            loading={loading}
            onClick={onSubmit}
            size="sm"
            type="button"
            variant="secondary"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {!compact && suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border/70 px-2.5 py-2">
          {suggestions.map((suggestion) => (
            <ChipButton
              className="normal-case tracking-normal"
              key={suggestion}
              onClick={() => onChange(suggestion)}
              size="compact"
              variant="flat"
            >
              {suggestion}
            </ChipButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
