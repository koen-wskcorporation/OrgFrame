"use client";

import * as React from "react";
import { Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { Chip, type ChipColor } from "./chip";
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
};

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange"> & {
  options: SelectOption[];
  placeholder?: string;
  variant?: "default" | "inline";
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  /** When true, replaces the trigger button with a search input that filters options as the user types. */
  searchable?: boolean;
};

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
    const [query, setQuery] = React.useState("");
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const buttonTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const inputTriggerRef = React.useRef<HTMLInputElement | null>(null);
    const triggerRef = (searchable ? inputTriggerRef : buttonTriggerRef) as React.RefObject<HTMLElement | null>;
    const selectRef = React.useRef<HTMLSelectElement | null>(null);
    const listboxId = React.useId();
    const selectedValue = String(isControlled ? value ?? "" : uncontrolledValue);
    const enabledOptionIndexes = React.useMemo(() => getEnabledOptionIndexes(options), [options]);
    const selectedIndex = options.findIndex((option) => option.value === selectedValue);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

    const filteredOptions = React.useMemo(() => {
      if (!searchable) return options;
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter((option) => option.label.toLowerCase().includes(q));
    }, [options, query, searchable]);

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
      if (!isControlled) {
        setUncontrolledValue(nextValue);
      }

      emitChange(nextValue);
      setOpen(false);
      setQuery("");
      if (searchable) {
        inputTriggerRef.current?.focus();
      } else {
        buttonTriggerRef.current?.focus();
      }
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

        {searchable ? (
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
              placeholder={selectedOption?.label ?? placeholder}
              ref={inputTriggerRef}
              type="search"
              value={query}
            />
            {selectedOption?.chip && !query ? (
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
              const isSelected = option.value === selectedValue;
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
                    {option.imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={option.imageAlt ?? ""}
                        className="h-4 w-4 shrink-0 rounded-[4px] border border-border/70 object-cover"
                        src={option.imageSrc}
                      />
                    ) : null}
                    {option.icon ? <option.icon className="h-4 w-4 shrink-0 text-text-muted" /> : null}
                    {option.statusDot ? <span className={cn("h-2 w-2 shrink-0 rounded-full", resolveStatusDotClass(option.statusDot))} /> : null}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
