"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { cn } from "@orgframe/ui/primitives/utils";

type AiComposerVariant = "card" | "inline" | "compact";

type AiComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  suggestions?: string[];
  variant?: AiComposerVariant;
  autoFocus?: boolean;
  inputId?: string;
  inputRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  className?: string;
};

const MIN_ROWS_HEIGHT_PX = 40;
const MAX_ROWS_HEIGHT_PX = 180;

function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled: boolean
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    el.style.height = "0px";
    const next = Math.max(MIN_ROWS_HEIGHT_PX, Math.min(MAX_ROWS_HEIGHT_PX, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [ref, value, enabled]);
}

export function AiComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask anything…",
  disabled = false,
  loading = false,
  suggestions = [],
  variant = "card",
  autoFocus = false,
  inputId,
  inputRef,
  className
}: AiComposerProps) {
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);

  const isCompact = variant === "compact";
  useAutoResize(localTextareaRef, value, !isCompact);

  useEffect(() => {
    if (!autoFocus) return;
    const el = (isCompact ? localInputRef.current : localTextareaRef.current) ?? null;
    el?.focus();
  }, [autoFocus, isCompact]);

  const canSubmit = !disabled && !loading && value.trim().length > 0;

  const setRef = (node: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (isCompact) {
      localInputRef.current = node as HTMLInputElement | null;
    } else {
      localTextareaRef.current = node as HTMLTextAreaElement | null;
    }
    if (inputRef) {
      (inputRef as { current: HTMLTextAreaElement | HTMLInputElement | null }).current = node;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  const chromeClasses = {
    card: "rounded-card border border-border bg-surface shadow-sm focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20",
    inline: "rounded-card border border-transparent bg-surface-muted/45 focus-within:border-border focus-within:bg-surface",
    compact: "rounded-full border border-border bg-surface shadow-sm focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20"
  } as const;

  if (isCompact) {
    return (
      <div className={cn("relative flex items-center gap-1 px-1", chromeClasses.compact, className)}>
        <Sparkles className="ml-2 h-4 w-4 shrink-0 text-text-muted" />
        <input
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-text placeholder:text-text-muted focus:outline-none"
          disabled={disabled || loading}
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={(node) => setRef(node)}
          type="text"
          value={value}
        />
        <Button
          aria-label="Send"
          className="!h-8 !w-8 !px-0"
          disabled={!canSubmit}
          loading={loading}
          onClick={onSubmit}
          size="sm"
          type="button"
          variant="primary"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", chromeClasses[variant], className)}>
      <div className="flex items-start gap-2 px-4 pt-3">
        <div aria-hidden="true" className="flex h-6 shrink-0 items-center text-text-muted">
          <Sparkles className="h-4 w-4" />
        </div>
        <textarea
          className="min-h-[24px] max-h-[180px] flex-1 resize-none bg-transparent text-sm leading-6 text-text placeholder:text-text-muted focus:outline-none"
          disabled={disabled || loading}
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={(node) => setRef(node)}
          rows={1}
          value={value}
        />
      </div>
      <div className="flex items-center justify-end px-2 pb-2 pt-1">
        <Button
          aria-label="Send"
          className="!h-8 !w-8 !px-0"
          disabled={!canSubmit}
          loading={loading}
          onClick={onSubmit}
          size="sm"
          type="button"
          variant="primary"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border/70 px-2.5 py-2">
          {suggestions.map((suggestion) => (
            <Chip
              className="normal-case tracking-normal"
              key={suggestion}
              onClick={() => onChange(suggestion)}
            >
              {suggestion}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
