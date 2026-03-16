"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SlugValidationKind = "org" | "page" | "program" | "form";

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
const inputShellClass =
  "flex h-10 w-full items-center rounded-control border border-border bg-surface text-sm text-text shadow-[inset_0_1px_0_hsl(var(--canvas)/0.35)]";
const inputFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
const inputDisabledClass = "disabled:cursor-not-allowed disabled:opacity-55";
const inlineInputClass =
  "h-auto rounded-none border-0 border-b border-dotted border-border/80 bg-transparent px-0 py-0 text-inherit shadow-none focus-visible:border-accent focus-visible:ring-0 focus-visible:ring-offset-0";

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
    (payload.kind === "org" || payload.kind === "page" || payload.kind === "program" || payload.kind === "form") &&
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
    return `/${orgSlug}/programs/`;
  }

  if (slugValidation.kind === "form" && orgSlug) {
    return `/${orgSlug}/register/`;
  }

  if (slugValidation.kind === "page" && orgSlug) {
    return `/${orgSlug}/`;
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
    const inputElement = hasPrefix ? (
      <div
        className={cn(
          inputShellClass,
          "pr-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas",
          isSlugUnavailable ? "border-destructive focus-within:ring-destructive/40" : null,
          slugStatus === "available" ? "border-success/40" : null,
          props.disabled ? "cursor-not-allowed opacity-55" : null,
          className
        )}
      >
        <span className="shrink-0 pl-3 text-[13px] text-text-muted">{resolvedPrefix}</span>
        <input
          aria-invalid={isSlugUnavailable ? true : props["aria-invalid"]}
          className="h-full w-full border-0 bg-transparent px-1 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none"
          defaultValue={defaultValue}
          onChange={handleChange}
          ref={assignRef}
          value={value}
          {...props}
        />
      </div>
    ) : (
      <input
        aria-invalid={isSlugUnavailable ? true : props["aria-invalid"]}
        className={cn(
          variant === "inline" ? null : inputShellClass,
          variant === "inline" ? inlineInputClass : null,
          variant === "inline" ? null : inputFocusClass,
          inputDisabledClass,
          variant === "inline" ? "placeholder:text-text-muted/70" : "px-3 py-2 placeholder:text-text-muted",
          isSlugUnavailable ? "border-destructive focus-visible:ring-destructive/40" : null,
          slugStatus === "available" ? "border-success/40" : null,
          className
        )}
        defaultValue={defaultValue}
        onChange={handleChange}
        ref={assignRef}
        value={value}
        {...props}
      />
    );

    if (!isSlugField) {
      return inputElement;
    }

    return (
      <div className="space-y-1">
        {inputElement}
        {shouldShowStatus ? (
          <p
            className={cn(
              "text-xs leading-relaxed",
              slugStatus === "taken" || slugStatus === "invalid" ? "text-destructive" : null,
              slugStatus === "available" ? "text-success" : null,
              slugStatus === "checking" || slugStatus === "error" ? "text-text-muted" : null
            )}
          >
            {slugMessage}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
