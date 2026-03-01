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
  slugValidation?: SlugValidationConfig;
  persistentPrefix?: string;
};

type SlugAvailabilityResponse = {
  ok: true;
  kind: SlugValidationKind;
  normalizedSlug: string;
  available: boolean;
  message: string | null;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, slugValidation, persistentPrefix, onChange, value, defaultValue, ...props }, forwardedRef) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const latestRequestId = React.useRef(0);
    const isControlled = value !== undefined;
    const [inputValue, setInputValue] = React.useState(() => (isControlled ? asStringValue(value) : asStringValue(defaultValue)));
    const [slugStatus, setSlugStatus] = React.useState<SlugValidationStatus>("idle");
    const [slugMessage, setSlugMessage] = React.useState<string | null>(null);
    const slugValidationKind = slugValidation?.kind;
    const slugValidationOrgSlug = slugValidation?.orgSlug;
    const slugValidationCurrentSlug = slugValidation?.currentSlug;
    const slugValidationEnabled = slugValidation?.enabled;
    const slugValidationDebounceMs = slugValidation?.debounceMs;

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
      }, slugValidationDebounceMs ?? 220);

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
      slugValidationDebounceMs
    ]);

    React.useEffect(() => {
      if (!inputRef.current) {
        return;
      }

      if (slugStatus === "taken" || slugStatus === "invalid") {
        inputRef.current.setCustomValidity(slugMessage ?? "Invalid slug.");
        return;
      }

      inputRef.current.setCustomValidity("");
    }, [slugMessage, slugStatus]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    const isSlugField = Boolean(slugValidation && slugValidationEnabled !== false);
    const isSlugUnavailable = slugStatus === "taken" || slugStatus === "invalid";
    const shouldShowStatus = isSlugField && inputValue.trim().length > 0 && slugMessage;
    const hasPrefix = Boolean(persistentPrefix);
    const inputElement = hasPrefix ? (
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-control border bg-surface pr-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas",
          isSlugUnavailable ? "border-destructive focus-within:ring-destructive/40" : null,
          slugStatus === "available" ? "border-success/40" : null,
          props.disabled ? "cursor-not-allowed opacity-55" : null,
          className
        )}
      >
        <span className="shrink-0 pl-3 text-text-muted">{persistentPrefix}</span>
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
          "flex h-10 w-full rounded-control border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-55",
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
              "text-xs",
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
