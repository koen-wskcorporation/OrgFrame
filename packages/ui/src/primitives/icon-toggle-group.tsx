"use client";

import * as React from "react";
import { Button } from "./button";
import { cn } from "./utils";

export type IconToggleOption<TValue extends string> = {
  value: TValue;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
};

type IconToggleGroupProps<TValue extends string> = {
  value: TValue;
  onChange: (next: TValue) => void;
  options: IconToggleOption<TValue>[];
  ariaLabel: string;
  className?: string;
};

export function IconToggleGroup<TValue extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className
}: IconToggleGroupProps<TValue>) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-surface p-0.5 shadow-sm",
        className
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;
        return (
          <Button
            aria-checked={isActive}
            aria-label={option.label}
            className={cn(
              "h-7 w-7 border",
              isActive
                ? "border-transparent bg-accent/15 text-text"
                : "border-transparent text-text-muted hover:bg-surface-muted"
            )}
            iconOnly
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            title={option.label}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}
