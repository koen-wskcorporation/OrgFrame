"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { rangeOptions, type RangeKey } from "@/src/features/data-center/range";

type RangeSelectorProps = {
  value: RangeKey;
};

export function RangeSelector({ value }: RangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "30d") params.delete("range");
    else params.set("range", next);
    const qs = params.toString();
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-muted">
      <span>Range</span>
      <select
        className="rounded-md border border-border bg-surface-panel px-2 py-1 text-sm text-text disabled:opacity-50"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        aria-label="Time range"
      >
        {rangeOptions.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
