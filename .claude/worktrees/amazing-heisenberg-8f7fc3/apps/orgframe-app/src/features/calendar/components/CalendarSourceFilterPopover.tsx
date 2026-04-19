"use client";

import { useRef, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Popover } from "@orgframe/ui/primitives/popover";
import { CalendarSourceTree } from "@/src/features/calendar/components/CalendarSourceTree";
import type { CalendarSource } from "@/src/features/calendar/types";

type CalendarSourceFilterPopoverProps = {
  sources: CalendarSource[];
  selectedSourceIds: Set<string>;
  onChange: (nextSourceIds: Set<string>) => void;
  className?: string;
};

export function CalendarSourceFilterPopover({ sources, selectedSourceIds, onChange, className }: CalendarSourceFilterPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const activeCount = selectedSourceIds.size;

  return (
    <>
      <Button className={className} onClick={() => setOpen((current) => !current)} ref={triggerRef} size="sm" type="button" variant="secondary">
        <Filter className="h-4 w-4" />
        Calendars ({activeCount})
      </Button>
      <Popover anchorRef={triggerRef} onClose={() => setOpen(false)} open={open} placement="bottom-end" portal={false}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Visible Calendars</p>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => onChange(new Set(sources.map((source) => source.id)))}
                size="sm"
                type="button"
                variant="ghost"
              >
                All
              </Button>
              <Button onClick={() => onChange(new Set())} size="sm" type="button" variant="ghost">
                None
              </Button>
            </div>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            <CalendarSourceTree onChange={onChange} selectedSourceIds={selectedSourceIds} sources={sources} />
          </div>
        </div>
      </Popover>
    </>
  );
}
