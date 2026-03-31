import * as React from "react";
import { cn } from "./utils";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

type FieldShellProps = {
  children: React.ReactNode;
  className?: string;
};

type FieldLabelProps = {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
};

type FieldHintProps = {
  children: React.ReactNode;
  className?: string;
};

type FieldErrorProps = {
  children: React.ReactNode;
  className?: string;
};

export function FieldShell({ children, className }: FieldShellProps) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

export function FieldLabel({ children, htmlFor, className }: FieldLabelProps) {
  return (
    <label className={cn("block text-[13px] font-semibold leading-tight text-text", className)} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function FieldHint({ children, className }: FieldHintProps) {
  return <p className={cn("text-xs leading-relaxed text-text-muted", className)}>{children}</p>;
}

export function FieldError({ children, className }: FieldErrorProps) {
  return <p className={cn("text-xs font-medium leading-relaxed text-destructive", className)}>{children}</p>;
}

export function FormField({ label, htmlFor, hint, error, children, className }: FormFieldProps) {
  return (
    <FieldShell className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </FieldShell>
  );
}
