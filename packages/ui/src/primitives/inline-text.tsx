"use client";

import * as React from "react";
import { cn } from "./utils";

type CommonProps = {
  /** Current value. */
  value: string;
  /** Called when the user commits an edit (blur or Enter). */
  onCommit: (next: string) => void;
  /** Optional callback for live keystrokes — fires on every change. */
  onDraftChange?: (next: string) => void;
  /** Placeholder shown when `value` is empty. */
  placeholder?: string;
  /** When true the component renders as plain text without an editable affordance. */
  disabled?: boolean;
  /**
   * Forwarded to both the static text element and the editable element so
   * the editing experience visually matches the surrounding typography
   * (font size, weight, colour, leading, etc).
   */
  className?: string;
  /** Auto-focus the field on mount. Useful for newly-inserted blocks. */
  autoFocus?: boolean;
  /** Max characters allowed. Enforced on commit. */
  maxLength?: number;
  /** ARIA label. Falls back to placeholder. */
  ariaLabel?: string;
};

export type InlineTextProps =
  | (CommonProps & {
      multiline?: false;
      /** Renders the static (non-editing) view inside this element. */
      as?: "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p";
    })
  | (CommonProps & {
      multiline: true;
      /** Multiline text is rendered as a `<p>` when static. `as` is ignored. */
      as?: never;
    });

/**
 * Inline-editable text. Renders as plain text until clicked, then becomes
 * an `<input>` (single-line) or `<textarea>` (multiline) that visually
 * matches the surrounding typography. Use inside block renderers to let
 * users edit headlines/copy in place rather than in a separate settings
 * dialog.
 *
 * Commit/cancel UX:
 *   - Click outside (blur) → commit
 *   - Enter → commit (single-line); Cmd/Ctrl+Enter → commit (multiline)
 *   - Escape → cancel, revert to last committed value
 */
export function InlineText(props: InlineTextProps) {
  const {
    value,
    onCommit,
    onDraftChange,
    placeholder = "",
    disabled = false,
    className,
    autoFocus = false,
    maxLength,
    ariaLabel
  } = props;
  const multiline = "multiline" in props && props.multiline === true;

  const [editing, setEditing] = React.useState(autoFocus);
  const [draft, setDraft] = React.useState(value);
  const fieldRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Sync draft when the external value changes and we're not editing — keeps
  // the displayed text in step with external mutations (undo, server save).
  React.useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  React.useEffect(() => {
    if (editing) {
      const el = fieldRef.current;
      if (el) {
        el.focus();
        if ("select" in el) {
          el.select();
        }
      }
    }
  }, [editing]);

  const commit = React.useCallback(() => {
    const next = maxLength ? draft.slice(0, maxLength) : draft;
    if (next !== value) onCommit(next);
    setEditing(false);
  }, [draft, maxLength, onCommit, value]);

  const cancel = React.useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (editing && !disabled) {
    // Base classes neutralize the native input chrome so the field can be
    // styled by the caller-provided className alone (font, colour, weight
    // are all inherited from the surrounding text node).
    const sharedClass = cn(
      "w-full min-w-0 bg-transparent p-0 text-inherit outline-none ring-0 border-0",
      "focus-visible:outline-none focus-visible:ring-0 focus-visible:border-0",
      "placeholder:text-current placeholder:opacity-50",
      className
    );

    if (multiline) {
      return (
        <textarea
          aria-label={ariaLabel ?? placeholder}
          className={cn(sharedClass, "resize-none overflow-hidden leading-inherit")}
          maxLength={maxLength}
          onBlur={commit}
          onChange={(event) => {
            setDraft(event.target.value);
            onDraftChange?.(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
              return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          ref={(el) => {
            fieldRef.current = el;
            if (el) {
              // Auto-grow to fit content so the field reads as a paragraph,
              // not a textarea. Caps at a reasonable bound.
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 600)}px`;
            }
          }}
          rows={1}
          value={draft}
        />
      );
    }

    return (
      <input
        aria-label={ariaLabel ?? placeholder}
        className={sharedClass}
        maxLength={maxLength}
        onBlur={commit}
        onChange={(event) => {
          setDraft(event.target.value);
          onDraftChange?.(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
        ref={(el) => {
          fieldRef.current = el;
        }}
        type="text"
        value={draft}
      />
    );
  }

  // Static (non-editing) view. Uses the requested element type, with a
  // subtle dotted underline on hover to advertise the affordance.
  const staticClass = cn(
    "cursor-text rounded-sm transition-colors",
    "hover:bg-current/5",
    !value && "italic opacity-60",
    className
  );

  const onClick = disabled ? undefined : () => setEditing(true);
  const onKeyDown = disabled
    ? undefined
    : (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      };

  const role = disabled ? undefined : "button";
  const tabIndex = disabled ? undefined : 0;
  const displayed = value || placeholder;

  if (multiline) {
    return (
      <p
        aria-label={disabled ? undefined : `Edit ${ariaLabel ?? placeholder}`}
        className={staticClass}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role={role}
        tabIndex={tabIndex}
      >
        {displayed}
      </p>
    );
  }

  const Tag = (props.as ?? "span") as React.ElementType;
  return (
    <Tag
      aria-label={disabled ? undefined : `Edit ${ariaLabel ?? placeholder}`}
      className={staticClass}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
    >
      {displayed}
    </Tag>
  );
}
