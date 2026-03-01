"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  imageSrc?: string;
  imageAlt?: string;
};

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange"> & {
  options: SelectOption[];
  placeholder?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
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
      id,
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
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const selectRef = React.useRef<HTMLSelectElement | null>(null);
    const listboxId = React.useId();
    const selectedValue = String(isControlled ? value ?? "" : uncontrolledValue);
    const enabledOptionIndexes = React.useMemo(() => getEnabledOptionIndexes(options), [options]);
    const selectedIndex = options.findIndex((option) => option.value === selectedValue);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

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
        if (target && rootRef.current?.contains(target)) {
          return;
        }
        setOpen(false);
      };

      document.addEventListener("pointerdown", onPointerDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
      };
    }, [open]);

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
      triggerRef.current?.focus();
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

        <button
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 py-2 text-left text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-55",
            !selectedOption ? "text-text-muted" : "",
            className
          )}
          disabled={disabled}
          id={id}
          onClick={() => {
            triggerRef.current?.focus();
            setOpen((current) => !current);
          }}
          onKeyDown={handleTriggerKeyDown}
          ref={triggerRef}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedOption?.imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={selectedOption.imageAlt ?? ""}
                className="h-4 w-4 shrink-0 rounded-[4px] border border-border/70 object-cover"
                src={selectedOption.imageSrc}
              />
            ) : null}
            <span className="truncate">{selectedOption?.label ?? placeholder}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open ? "rotate-180" : "")} />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-control border bg-surface shadow-card">
            <ul className="max-h-60 overflow-y-auto py-1" id={listboxId} role="listbox">
              {options.map((option, index) => {
                const isSelected = option.value === selectedValue;
                const isHighlighted = index === highlightedIndex;
                const itemDisabled = Boolean(option.disabled);

                return (
                  <li aria-selected={isSelected} key={option.value} role="option">
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text",
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
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {isSelected ? <Check className="h-4 w-4 shrink-0 text-text-muted" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
