"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import { Avatar } from "./avatar";
import { Chip, type ChipColor } from "./chip";
import { EntityChip } from "./entity-chip";
import { formControlDisabledClass, formControlFocusClass, formControlInlineClass, formControlShellClass } from "./form-control";
import { Popover } from "./popover";
import { cn } from "./utils";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  imageSrc?: string;
  imageAlt?: string;
  /** Lucide icon rendered inline before the label (trigger + listbox). */
  icon?: LucideIcon;
  statusDot?: "success" | "warning" | "destructive" | "muted";
  meta?: string;
  /** Chip rendered after the label (trigger + listbox). When `status` is true, the chip renders with a status dot. */
  chip?: { label: string; color?: ChipColor | string; status?: boolean };
  /**
   * Avatar rendered before the label (trigger + listbox). Use this for
   * entity-style options (people, teams, programs) instead of `imageSrc`.
   * Falls back to initials when `src` is null/undefined.
   */
  avatar?: { name: string; src?: string | null };
  /**
   * Secondary line rendered below the label inside the listbox row. Used
   * for entity-style options to show email / slug / description.
   */
  subtext?: string;
};

type SelectMultiProps = {
  /** Enable multi-select. The trigger becomes a search input and selected items render as chips beneath it. */
  multiple: true;
  /** Controlled list of selected option values. */
  values: string[];
  /** Fires on every add/remove with the new selection. */
  onValuesChange: (values: string[]) => void;
  value?: never;
  onChange?: never;
};

type SelectSingleProps = {
  multiple?: false;
  values?: never;
  onValuesChange?: never;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
};

type SelectBaseProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange" | "multiple" | "value"> & {
  options: SelectOption[];
  placeholder?: string;
  variant?: "default" | "inline";
  /** When true, replaces the trigger button with a search input that filters options as the user types. Forced on in multi-select. */
  searchable?: boolean;
  /** Notified whenever the internal search query changes. Useful for callers that synthesize options from typed text (e.g. a "use this URL" row). */
  onQueryChange?: (query: string) => void;
  /** Optional helper text rendered under the selection chips in multi-select mode. */
  multiHelperText?: string;
  /** Message rendered when nothing is selected (multi-select only). */
  multiEmptyMessage?: string;
  value?: string;
};

type SelectProps = SelectBaseProps & (SelectSingleProps | SelectMultiProps);

function resolveInitialValue(options: SelectOption[], providedValue: string | undefined) {
  if (providedValue !== undefined) {
    return providedValue;
  }

  return options[0]?.value ?? "";
}

function getEnabledOptionIndexes(options: SelectOption[]) {
  return options.reduce<number[]>((indexes, option, index) => {
    if (!option.disabled) {
      indexes.push(index);
    }
    return indexes;
  }, []);
}

function resolveStatusDotClass(statusDot: SelectOption["statusDot"]) {
  if (statusDot === "success") {
    return "bg-emerald-500";
  }
  if (statusDot === "warning") {
    return "bg-amber-500";
  }
  if (statusDot === "destructive") {
    return "bg-rose-500";
  }
  return "bg-zinc-400";
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      options,
      value,
      defaultValue,
      disabled = false,
      name,
      required,
      onChange,
      placeholder = "Select an option",
      variant = "default",
      id,
      searchable = false,
      onQueryChange,
      multiple = false,
      values,
      onValuesChange,
      multiHelperText,
      multiEmptyMessage,
      ...props
    },
    ref
  ) => {
    const defaultStringValue = typeof defaultValue === "string" ? defaultValue : undefined;
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
      resolveInitialValue(options, defaultStringValue)
    );
    const [open, setOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState<number>(-1);
    const [query, setQueryState] = React.useState("");
    const setQuery = React.useCallback(
      (next: string) => {
        setQueryState(next);
        onQueryChange?.(next);
      },
      [onQueryChange]
    );
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const buttonTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const inputTriggerRef = React.useRef<HTMLInputElement | null>(null);
    // Multi-select forces the search-input trigger — anything else would
    // force the trigger to render N selected labels in a non-scaling string.
    const effectiveSearchable = searchable || multiple;
    const triggerRef = (effectiveSearchable ? inputTriggerRef : buttonTriggerRef) as React.RefObject<HTMLElement | null>;
    const selectRef = React.useRef<HTMLSelectElement | null>(null);
    const listboxId = React.useId();
    const selectedValue = String(isControlled ? value ?? "" : uncontrolledValue);
    const selectedSet = React.useMemo(() => new Set(multiple ? values ?? [] : []), [multiple, values]);
    const enabledOptionIndexes = React.useMemo(() => getEnabledOptionIndexes(options), [options]);
    const selectedIndex = options.findIndex((option) => option.value === selectedValue);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
    const selectedMultiOptions = React.useMemo(() => {
      if (!multiple) return [] as SelectOption[];
      const byValue = new Map(options.map((option) => [option.value, option] as const));
      return (values ?? []).map((v) => byValue.get(v)).filter((opt): opt is SelectOption => Boolean(opt));
    }, [multiple, options, values]);

    const filteredOptions = React.useMemo(() => {
      if (!effectiveSearchable) return options;
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter((option) => {
        const haystack = `${option.label} ${option.subtext ?? ""} ${option.avatar?.name ?? ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }, [options, query, effectiveSearchable]);

    React.useEffect(() => {
      if (!open) {
        setQuery("");
      }
    }, [open]);

    function setSelectRef(node: HTMLSelectElement | null) {
      selectRef.current = node;

      if (typeof ref === "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    }

    React.useEffect(() => {
      if (isControlled) {
        return;
      }

      const hasMatch = options.some((option) => option.value === uncontrolledValue);

      if (hasMatch) {
        return;
      }

      setUncontrolledValue(options[0]?.value ?? "");
    }, [isControlled, options, uncontrolledValue]);

    React.useEffect(() => {
      if (!open) {
        return;
      }

      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        // Inside the trigger / hidden <select> wrapper.
        if (rootRef.current?.contains(target)) return;
        // Inside our own listbox, which `Popover` portals to <body> — so
        // a `contains()` check against rootRef alone always misses it.
        // Without this branch, clicking any option fires this handler
        // first, which closes the popover; React then unmounts it before
        // the option's `onClick` can run, so the new value never reaches
        // `selectValue` and the field appears stuck on its previous pick.
        const targetEl = target instanceof Element ? target : null;
        if (targetEl?.closest(`#${CSS.escape(listboxId)}`)) return;
        setOpen(false);
      };

      document.addEventListener("pointerdown", onPointerDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
      };
    }, [open, listboxId]);

    React.useEffect(() => {
      if (!open) {
        return;
      }

      if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
        setHighlightedIndex(selectedIndex);
        return;
      }

      setHighlightedIndex(enabledOptionIndexes[0] ?? -1);
    }, [enabledOptionIndexes, open, options, selectedIndex]);

    function emitChange(nextValue: string) {
      if (!onChange) {
        return;
      }

      const element = selectRef.current;

      if (!element) {
        return;
      }

      element.value = nextValue;
      onChange({
        target: element,
        currentTarget: element
      } as React.ChangeEvent<HTMLSelectElement>);
    }

    function selectValue(nextValue: string) {
      if (multiple) {
        const current = values ?? [];
        const next = current.includes(nextValue)
          ? current.filter((v) => v !== nextValue)
          : [...current, nextValue];
        onValuesChange?.(next);
        setOpen(false);
        setQuery("");
        return;
      }

      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }

      emitChange(nextValue);
      setOpen(false);
      setQuery("");
      if (effectiveSearchable) {
        inputTriggerRef.current?.focus();
      } else {
        buttonTriggerRef.current?.focus();
      }
    }

    function removeMultiValue(targetValue: string) {
      if (!multiple) return;
      const current = values ?? [];
      onValuesChange?.(current.filter((v) => v !== targetValue));
    }

    function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
      if (disabled) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();

        if (!open) {
          setOpen(true);
          return;
        }

        if (enabledOptionIndexes.length === 0) {
          return;
        }

        const currentPosition = enabledOptionIndexes.indexOf(highlightedIndex);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextPosition =
          currentPosition < 0
            ? 0
            : (currentPosition + delta + enabledOptionIndexes.length) % enabledOptionIndexes.length;
        setHighlightedIndex(enabledOptionIndexes[nextPosition]);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }

        if (highlightedIndex >= 0) {
          const highlightedOption = options[highlightedIndex];
          if (highlightedOption && !highlightedOption.disabled) {
            selectValue(highlightedOption.value);
          }
        }
        return;
      }

      if (event.key === "Escape") {
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      }

      if (event.key === "Tab" && open) {
        setOpen(false);
      }
    }

    return (
      <div className="relative" ref={rootRef}>
        <select
          {...props}
          aria-hidden="true"
          className="sr-only"
          disabled={disabled}
          name={name}
          onChange={() => {}}
          ref={setSelectRef}
          required={required}
          tabIndex={-1}
          value={selectedValue}
        >
          {options.map((option) => (
            <option disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {effectiveSearchable ? (
          <div
            className={cn(
              variant === "inline"
                ? `flex h-auto w-full items-center gap-2 ${formControlInlineClass} px-0 py-0 text-inherit`
                : `flex h-10 w-full items-center gap-2 rounded-control px-3 py-2 text-sm ${formControlShellClass}`,
              formControlDisabledClass,
              "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas",
              className
            )}
          >
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              aria-controls={listboxId}
              aria-expanded={open}
              aria-haspopup="listbox"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-text placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed"
              disabled={disabled}
              id={id}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!open) setOpen(true);
              }}
              onFocus={() => {
                if (!disabled) setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  if (open) {
                    event.preventDefault();
                    setOpen(false);
                  }
                  return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
                  // Defer to the shared listbox keyboard handling.
                  handleTriggerKeyDown(event as unknown as React.KeyboardEvent<HTMLButtonElement>);
                }
              }}
              placeholder={multiple ? placeholder : selectedOption?.label ?? placeholder}
              ref={inputTriggerRef}
              type="search"
              value={query}
            />
            {!multiple && selectedOption?.chip && !query ? (
              <Chip color={selectedOption.chip.color} status={selectedOption.chip.status} showDot={selectedOption.chip.status ? undefined : false}>
                {selectedOption.chip.label}
              </Chip>
            ) : null}
            <ChevronDown
              className={cn(
                variant === "inline" ? "h-3.5 w-3.5" : "h-4 w-4",
                "shrink-0 text-text-muted transition-transform",
                open ? "rotate-180" : ""
              )}
            />
          </div>
        ) : (
          <button
            aria-controls={listboxId}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              variant === "inline"
                ? `flex h-auto w-full items-center justify-between gap-2 ${formControlInlineClass} px-0 py-0 text-left text-inherit transition-colors duration-150 focus:outline-none focus:ring-0 focus:ring-offset-0`
                : `flex h-10 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-canvas ${formControlShellClass} ${formControlFocusClass}`,
              formControlDisabledClass,
              !selectedOption ? "text-text-muted" : "",
              className
            )}
            disabled={disabled}
            id={id}
            onClick={() => {
              buttonTriggerRef.current?.focus();
              setOpen((current) => !current);
            }}
            onKeyDown={handleTriggerKeyDown}
            ref={buttonTriggerRef}
            type="button"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {selectedOption?.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={selectedOption.imageAlt ?? ""}
                  className="h-4 w-4 shrink-0 rounded-[4px] border border-border/70 object-cover"
                  src={selectedOption.imageSrc}
                />
              ) : null}
              {selectedOption?.icon ? <selectedOption.icon className="h-4 w-4 shrink-0 text-text-muted" /> : null}
              {selectedOption?.statusDot ? <span className={cn("h-2 w-2 shrink-0 rounded-full", resolveStatusDotClass(selectedOption.statusDot))} /> : null}
              <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? placeholder}</span>
              {selectedOption?.chip ? (
                <Chip color={selectedOption.chip.color} showDot={false}>
                  {selectedOption.chip.label}
                </Chip>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                variant === "inline" ? "h-3.5 w-3.5" : "h-4 w-4",
                "shrink-0 text-text-muted transition-transform",
                open ? "rotate-180" : ""
              )}
            />
          </button>
        )}

        <Popover
          anchorRef={triggerRef}
          className={cn(
            "rounded-control border bg-surface p-0 shadow-floating",
            variant === "inline" ? "min-w-[12rem] max-w-[18rem]" : "max-w-none"
          )}
          matchAnchorWidth={variant !== "inline"}
          offset={6}
          onClose={() => setOpen(false)}
          open={open}
          placement="bottom-start"
        >
          <ul className="max-h-60 overflow-y-auto py-1.5" id={listboxId} role="listbox">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-xs text-text-muted">No matches.</li>
            ) : null}
            {filteredOptions.map((option) => {
              const index = options.indexOf(option);
              const isSelected = multiple ? selectedSet.has(option.value) : option.value === selectedValue;
              const isHighlighted = index === highlightedIndex;
              const itemDisabled = Boolean(option.disabled);

              return (
                <li aria-selected={isSelected} key={option.value} role="option">
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors",
                      itemDisabled ? "cursor-not-allowed opacity-55" : "hover:bg-surface-muted",
                      isHighlighted ? "bg-surface-muted" : ""
                    )}
                    disabled={itemDisabled}
                    onClick={() => {
                      selectValue(option.value);
                    }}
                    onMouseEnter={() => {
                      if (!itemDisabled) {
                        setHighlightedIndex(index);
                      }
                    }}
                    type="button"
                  >
                    {option.avatar ? (
                      <Avatar alt={`${option.avatar.name} avatar`} name={option.avatar.name} sizePx={24} src={option.avatar.src ?? null} />
                    ) : option.imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={option.imageAlt ?? ""}
                        className="h-4 w-4 shrink-0 rounded-[4px] border border-border/70 object-cover"
                        src={option.imageSrc}
                      />
                    ) : null}
                    {option.icon ? <option.icon className="h-4 w-4 shrink-0 text-text-muted" /> : null}
                    {option.statusDot ? <span className={cn("h-2 w-2 shrink-0 rounded-full", resolveStatusDotClass(option.statusDot))} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.subtext ? <span className="block truncate text-xs text-text-muted">{option.subtext}</span> : null}
                    </span>
                    {option.chip ? (
                      <Chip color={option.chip.color} status={option.chip.status} showDot={option.chip.status ? undefined : false}>
                        {option.chip.label}
                      </Chip>
                    ) : null}
                    {option.meta ? <span className="shrink-0 text-xs text-text-muted">{option.meta}</span> : null}
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-text-muted" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover>

        {multiple ? (
          <div className="mt-3 space-y-2">
            {multiHelperText ? <p className="text-xs text-text-muted">{multiHelperText}</p> : null}
            {selectedMultiOptions.length === 0 ? (
              <p className="rounded-control border border-dashed px-3 py-3 text-sm text-text-muted">
                {multiEmptyMessage ?? "Nothing selected yet."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedMultiOptions.map((option) => {
                  if (option.avatar) {
                    return (
                      <EntityChip
                        key={option.value}
                        avatarUrl={option.avatar.src ?? null}
                        name={option.avatar.name}
                        {...(option.chip ? { status: { label: option.chip.label, variant: "neutral" as const, showDot: false } } : {})}
                        {...(disabled ? {} : { onRemove: () => removeMultiValue(option.value) })}
                        removeAriaLabel={`Remove ${option.avatar.name}`}
                      />
                    );
                  }
                  return (
                    <Chip
                      className="inline-flex items-center gap-1"
                      color={option.chip?.color}
                      key={option.value}
                      showDot={false}
                    >
                      {option.label}
                      {disabled ? null : (
                        <button
                          aria-label={`Remove ${option.label}`}
                          className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-surface-muted"
                          onClick={() => removeMultiValue(option.value)}
                          type="button"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Chip>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
