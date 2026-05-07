"use client";

import * as React from "react";
import { formControlDisabledClass, formControlFocusClass, formControlInlineClass, formControlShellClass } from "./form-control";
import { cn } from "./utils";

export type SlugValidationKind = "org" | "page" | "program" | "form" | "space";

type SlugValidationConfig = {
  kind: SlugValidationKind;
  orgSlug?: string;
  currentSlug?: string;
  debounceMs?: number;
  enabled?: boolean;
};

type SlugValidationStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: "default" | "inline";
  slugValidation?: SlugValidationConfig;
  persistentPrefix?: string;
  persistentSuffix?: string;
  slugAutoSource?: string;
  onSlugAutoChange?: (value: string) => void;
  slugAutoEnabled?: boolean;
};

type SlugAvailabilityResponse = {
  ok: true;
  kind: SlugValidationKind;
  normalizedSlug: string;
  available: boolean;
  message: string | null;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const inputShellClass = `flex h-10 w-full items-center rounded-control text-sm ${formControlShellClass}`;
const inputFocusClass = formControlFocusClass;
const inputDisabledClass = formControlDisabledClass;
const inlineInputClass = `h-auto ${formControlInlineClass} px-0 py-0 text-inherit`;

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function asStringValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function isValidAvailabilityResponse(value: unknown): value is SlugAvailabilityResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<SlugAvailabilityResponse>;

  return (
    payload.ok === true &&
    (payload.kind === "org" || payload.kind === "page" || payload.kind === "program" || payload.kind === "form" || payload.kind === "space") &&
    typeof payload.normalizedSlug === "string" &&
    typeof payload.available === "boolean" &&
    (typeof payload.message === "string" || payload.message === null)
  );
}

function resolveSlugPathPrefix(slugValidation: SlugValidationConfig | undefined, persistentPrefix: string | undefined) {
  if (persistentPrefix) {
    return persistentPrefix;
  }

  if (!slugValidation) {
    return undefined;
  }

  const orgSlug = slugValidation.orgSlug?.trim();
  if (slugValidation.kind === "program" && orgSlug) {
    return "/programs/";
  }

  if (slugValidation.kind === "form" && orgSlug) {
    return "/register/";
  }

  if (slugValidation.kind === "page" && orgSlug) {
    return "/";
  }

  return undefined;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant = "default",
      slugValidation,
      persistentPrefix,
      persistentSuffix,
      onChange,
      value,
      defaultValue,
      slugAutoSource,
      onSlugAutoChange,
      slugAutoEnabled = true,
      ...props
    },
    forwardedRef
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const latestRequestId = React.useRef(0);
    const hasCustomizedSlugRef = React.useRef(false);
    const isControlled = value !== undefined;
    const [inputValue, setInputValue] = React.useState(() => (isControlled ? asStringValue(value) : asStringValue(defaultValue)));
    const [hasSlugBeenEdited, setHasSlugBeenEdited] = React.useState(false);
    const [slugStatus, setSlugStatus] = React.useState<SlugValidationStatus>("idle");
    const [slugMessage, setSlugMessage] = React.useState<string | null>(null);
    const slugValidationKind = slugValidation?.kind;
    const slugValidationOrgSlug = slugValidation?.orgSlug;
    const slugValidationCurrentSlug = slugValidation?.currentSlug;
    const slugValidationEnabled = slugValidation?.enabled;
    const slugValidationDebounceMs = slugValidation?.debounceMs;
    const isSlugField = Boolean(slugValidation && slugValidationEnabled !== false);
    const resolvedPrefix = resolveSlugPathPrefix(slugValidation, persistentPrefix);

    React.useEffect(() => {
      if (!isControlled) {
        return;
      }

      setInputValue(asStringValue(value));
    }, [isControlled, value]);

    React.useEffect(() => {
      if (!slugValidationKind || slugValidationEnabled === false) {
        setSlugStatus("idle");
        setSlugMessage(null);
        return;
      }

      if (!hasSlugBeenEdited) {
        setSlugStatus("idle");
        setSlugMessage(null);
        return;
      }

      const normalizedInput = normalizeSlug(inputValue);
      const normalizedCurrentSlug = normalizeSlug(slugValidationCurrentSlug ?? "");
      const isEmpty = inputValue.trim().length === 0;

      if (isEmpty) {
        setSlugStatus("idle");
        setSlugMessage(null);
        return;
      }

      if (normalizedCurrentSlug && normalizedInput === normalizedCurrentSlug) {
        setSlugStatus("available");
        setSlugMessage("Using current slug.");
        return;
      }

      if (!normalizedInput || normalizedInput.length < 2 || normalizedInput.length > 60 || !slugPattern.test(normalizedInput)) {
        setSlugStatus("invalid");
        setSlugMessage("Use 2-60 characters with lowercase letters, numbers, and hyphens.");
        return;
      }

      const requestId = latestRequestId.current + 1;
      latestRequestId.current = requestId;
      setSlugStatus("checking");
      setSlugMessage("Checking availability...");
      const controller = new AbortController();
      const timer = window.setTimeout(async () => {
        try {
          const response = await fetch("/api/slugs/availability", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              kind: slugValidationKind,
              orgSlug: slugValidationOrgSlug,
              currentSlug: slugValidationCurrentSlug,
              slug: inputValue
            }),
            signal: controller.signal
          });

          const payload = await response.json().catch(() => null);

          if (latestRequestId.current !== requestId) {
            return;
          }

          if (!response.ok || !isValidAvailabilityResponse(payload)) {
            setSlugStatus("error");
            setSlugMessage("Unable to check slug availability right now.");
            return;
          }

          setSlugStatus(payload.available ? "available" : "taken");
          setSlugMessage(payload.message ?? (payload.available ? "Slug is available." : "That slug already exists."));
        } catch (error) {
          if (controller.signal.aborted || latestRequestId.current !== requestId) {
            return;
          }

          setSlugStatus("error");
          setSlugMessage("Unable to check slug availability right now.");
        }
      }, slugValidationDebounceMs ?? 0);

      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [
      inputValue,
      slugValidationKind,
      slugValidationOrgSlug,
      slugValidationCurrentSlug,
      slugValidationEnabled,
      slugValidationDebounceMs,
      hasSlugBeenEdited
    ]);

    React.useEffect(() => {
      if (!isSlugField || slugAutoEnabled === false || !onSlugAutoChange || hasCustomizedSlugRef.current) {
        return;
      }

      const sourceSlug = normalizeSlug(slugAutoSource ?? "");
      if (normalizeSlug(inputValue) === sourceSlug) {
        return;
      }

      onSlugAutoChange(sourceSlug);

      // Auto-generated slugs should be validated for availability the same way
      // user-typed slugs are. Without this flip, the validation effect early
      // -exits on `!hasSlugBeenEdited` and the user never sees "taken /
      // available" while they're filling in the title field.
      if (sourceSlug.length > 0) {
        setHasSlugBeenEdited(true);
      }
    }, [inputValue, isSlugField, onSlugAutoChange, slugAutoEnabled, slugAutoSource]);

    React.useEffect(() => {
      if (!inputRef.current) {
        return;
      }

      if (hasSlugBeenEdited && (slugStatus === "taken" || slugStatus === "invalid")) {
        inputRef.current.setCustomValidity(slugMessage ?? "Invalid slug.");
        return;
      }

      inputRef.current.setCustomValidity("");
    }, [slugMessage, slugStatus, hasSlugBeenEdited]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isSlugField) {
        setHasSlugBeenEdited(true);
      }

      if (isSlugField && slugAutoEnabled !== false && !hasCustomizedSlugRef.current) {
        const sourceSlug = normalizeSlug(slugAutoSource ?? "");
        if (normalizeSlug(event.target.value) !== sourceSlug) {
          hasCustomizedSlugRef.current = true;
        }
      }

      setInputValue(event.target.value);
      onChange?.(event);
    };

    const assignRef = (element: HTMLInputElement | null) => {
      inputRef.current = element;

      if (!forwardedRef) {
        return;
      }

      if (typeof forwardedRef === "function") {
        forwardedRef(element);
        return;
      }

      forwardedRef.current = element;
    };

    const isSlugUnavailable = slugStatus === "taken" || slugStatus === "invalid";
    const shouldShowStatus = isSlugField && hasSlugBeenEdited && inputValue.trim().length > 0 && slugMessage;
    const hasPrefix = Boolean(resolvedPrefix);
    const hasSuffix = Boolean(persistentSuffix);

    const inputElement =
      variant === "inline" ? (
        <input
          aria-invalid={isSlugUnavailable ? true : props["aria-invalid"]}
          className={cn(inlineInputClass, inputDisabledClass, "placeholder:text-text-muted/70", className)}
          defaultValue={defaultValue}
          onChange={handleChange}
          ref={assignRef}
          value={value}
          {...props}
        />
      ) : (
        <div
          className={cn(
            inputShellClass,
            "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas",
            props.disabled ? "cursor-not-allowed opacity-55" : "cursor-text",
            className
          )}
          onMouseDown={(event) => {
            if (props.disabled) {
              return;
            }
            if (event.target === inputRef.current) {
              return;
            }
            event.preventDefault();
            inputRef.current?.focus();
            try {
              const length = inputRef.current?.value.length ?? 0;
              inputRef.current?.setSelectionRange(length, length);
            } catch {
              // setSelectionRange is not supported on all input types (e.g. email/number)
            }
          }}
        >
          {hasPrefix ? <span className="shrink-0 pl-3 text-[13px] text-text-muted">{resolvedPrefix}</span> : null}
          <input
            aria-invalid={isSlugUnavailable ? true : props["aria-invalid"]}
            className={cn(
              "h-full border-0 bg-transparent py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none",
              hasPrefix ? "pl-1" : "pl-3",
              hasSuffix ? "min-w-[2ch] max-w-full pr-0 [field-sizing:content]" : "w-full pr-3"
            )}
            defaultValue={defaultValue}
            onChange={handleChange}
            ref={assignRef}
            value={value}
            {...props}
          />
          {hasSuffix ? <span className="shrink-0 pl-0 pr-3 text-[13px] text-text-muted">{persistentSuffix}</span> : null}
        </div>
      );

    if (!isSlugField) {
      return inputElement;
    }

    const statusIcon =
      slugStatus === "available" ? (
        <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : slugStatus === "taken" || slugStatus === "invalid" ? (
        <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null;

    return (
      <div className="space-y-1">
        {inputElement}
        {shouldShowStatus ? (
          <p
            className={cn(
              "slug-status-enter flex items-center gap-1.5 text-xs leading-relaxed",
              slugStatus === "taken" || slugStatus === "invalid" ? "text-destructive" : null,
              slugStatus === "available" ? "text-success" : null,
              slugStatus === "checking" || slugStatus === "error" ? "text-text-muted" : null
            )}
            key={`${slugStatus}:${slugMessage}`}
          >
            {statusIcon}
            <span>{slugMessage}</span>
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
