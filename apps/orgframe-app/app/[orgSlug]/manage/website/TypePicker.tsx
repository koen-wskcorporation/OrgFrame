"use client";

import * as React from "react";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";

export type ItemType = "page" | "dropdown" | "link" | "dynamic";

type Option = {
  type: ItemType;
  label: string;
  description: string;
};

const OPTIONS: Option[] = [
  {
    type: "page",
    label: "Page",
    description: "A content page built with the visual block editor."
  },
  {
    type: "dropdown",
    label: "Dropdown",
    description: "A nav header that groups child links. No page of its own."
  },
  {
    type: "link",
    label: "External link",
    description: "A nav item that links to an external URL."
  },
  {
    type: "dynamic",
    label: "Dynamic page",
    description: "A page that auto-lists org content (programs, events, teams, facilities)."
  }
];

export type TypePickerProps = {
  value: ItemType;
  onChange: (type: ItemType) => void;
  /** Limit which types are offered. Defaults to all three. */
  types?: ItemType[];
};

/**
 * Vertical list of selectable cards for the website-manager item types.
 * Built on top of `<SelectionBox>` so it picks up the app's standard radio
 * styling: circle indicator pinned to the top-left corner, accent border on
 * the selected state, and the same hover / focus treatment used elsewhere
 * (e.g. SmartImportWorkspace).
 */
export function TypePicker({ value, onChange, types }: TypePickerProps) {
  const visible = React.useMemo(
    () => (types ? OPTIONS.filter((o) => types.includes(o.type)) : OPTIONS),
    [types]
  );
  return (
    <div className="grid gap-2" role="radiogroup">
      {visible.map((option) => (
        <SelectionBox
          description={option.description}
          key={option.type}
          label={option.label}
          onSelectedChange={(next) => {
            // SelectionBox always reports `true` when clicked. Treat any click
            // as "select this option".
            if (next) onChange(option.type);
          }}
          selected={value === option.type}
        />
      ))}
    </div>
  );
}
