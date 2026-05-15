"use client";

import * as React from "react";
import { Button } from "./button";
import { cn } from "./utils";

export type ButtonToggleOption<TValue extends string> = {
  value: TValue;
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  disabled?: boolean;
};

type ButtonToggleGroupProps<TValue extends string> = {
  value: TValue;
  onChange: (next: TValue) => void;
  options: ButtonToggleOption<TValue>[];
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
};

export function ButtonToggleGroup<TValue extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  disabled
}: ButtonToggleGroupProps<TValue>) {
  return (
    <div aria-label={ariaLabel} className={cn("flex gap-2", className)} role="radiogroup">
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;
        return (
          <Button
            aria-checked={isActive}
            aria-label={option.label}
            className="flex-1"
            disabled={disabled || (!isActive && Boolean(option.disabled))}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            variant={isActive ? "primary" : "secondary"}
          >
            {Icon ? <Icon aria-hidden /> : null}
            <span>{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
