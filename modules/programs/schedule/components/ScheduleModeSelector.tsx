"use client";

import { cn } from "@/lib/utils";
import type { ProgramScheduleMode } from "@/modules/programs/types";

const modeItems: Array<{ value: ProgramScheduleMode; label: string }> = [
  { value: "multiple_specific_dates", label: "Specific Dates" },
  { value: "continuous_date_range", label: "Continuous Date Range" },
  { value: "custom_advanced", label: "Custom Advanced" }
];

type ScheduleModeSelectorProps = {
  value: ProgramScheduleMode;
  onChange: (next: ProgramScheduleMode) => void;
  disabled?: boolean;
};

export function ScheduleModeSelector({ value, onChange, disabled = false }: ScheduleModeSelectorProps) {
  const normalizedValue =
    value === "single_date" || value === "repeating_pattern" ? "multiple_specific_dates" : value;

  return (
    <div className="overflow-hidden rounded-control border border-border bg-surface p-1">
      <div className="grid grid-cols-1 gap-1 md:grid-cols-3">
        {modeItems.map((item) => {
          const active = item.value === normalizedValue;
          return (
            <button
              className={cn(
                "rounded-control px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
              )}
              disabled={disabled}
              key={item.value}
              onClick={() => onChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
