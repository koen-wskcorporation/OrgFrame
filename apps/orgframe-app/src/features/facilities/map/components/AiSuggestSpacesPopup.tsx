"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Select } from "@orgframe/ui/primitives/select";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import type { FacilitySpaceSuggestion } from "@/src/features/facilities/actions";
import type { FacilitySpaceKind } from "@/src/features/facilities/types";

type SuggestionDraft = {
  name: string;
  kind: FacilitySpaceKind;
  accepted: boolean;
  points: Array<{ x: number; y: number }>;
};

type AiSuggestSpacesPopupProps = {
  open: boolean;
  loading: boolean;
  applying: boolean;
  suggestions: FacilitySpaceSuggestion[] | null;
  error: string | null;
  onClose: () => void;
  onApply: (
    accepted: Array<{ name: string; kind: FacilitySpaceKind; points: Array<{ x: number; y: number }> }>
  ) => Promise<void> | void;
};

const KIND_OPTIONS: Array<{ value: FacilitySpaceKind; label: string }> = [
  { value: "field", label: "Field" },
  { value: "court", label: "Court" },
  { value: "building", label: "Building" },
  { value: "pavilion", label: "Pavilion" },
  { value: "concessions", label: "Concessions" },
  { value: "lobby", label: "Lobby" },
  { value: "bathroom", label: "Bathroom" },
  { value: "storage", label: "Storage" },
  { value: "parking_lot", label: "Parking lot" },
  { value: "custom", label: "Custom" }
];

const KIND_VALUES = new Set<FacilitySpaceKind>(KIND_OPTIONS.map((option) => option.value));

function asKind(value: string): FacilitySpaceKind {
  return KIND_VALUES.has(value as FacilitySpaceKind) ? (value as FacilitySpaceKind) : "custom";
}

export function AiSuggestSpacesPopup({
  open,
  loading,
  applying,
  suggestions,
  error,
  onClose,
  onApply
}: AiSuggestSpacesPopupProps) {
  const [drafts, setDrafts] = React.useState<SuggestionDraft[]>([]);

  React.useEffect(() => {
    if (!suggestions) {
      setDrafts([]);
      return;
    }
    setDrafts(
      suggestions.map((s) => ({
        name: s.name,
        kind: s.kind,
        accepted: true,
        points: s.points
      }))
    );
  }, [suggestions]);

  const acceptedCount = drafts.reduce((acc, d) => acc + (d.accepted && d.name.trim().length > 0 ? 1 : 0), 0);

  function setDraft(index: number, patch: Partial<SuggestionDraft>) {
    setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function setAllAccepted(value: boolean) {
    setDrafts((current) => current.map((d) => ({ ...d, accepted: value })));
  }

  async function handleApply() {
    const accepted = drafts
      .filter((d) => d.accepted && d.name.trim().length > 0)
      .map((d) => ({
        name: d.name.trim(),
        kind: d.kind,
        points: d.points
      }));
    if (accepted.length === 0) return;
    await onApply(accepted);
  }

  return (
    <Popup
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {drafts.length > 0 ? (
            <button
              className="text-xs font-medium text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
              onClick={() => setAllAccepted(drafts.every((d) => d.accepted) ? false : true)}
              type="button"
            >
              {drafts.every((d) => d.accepted) ? "Deselect all" : "Select all"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={acceptedCount === 0 || applying || loading}
              loading={applying}
              onClick={handleApply}
              variant="primary"
            >
              <Sparkles />
              {acceptedCount === 0 ? "Add spaces" : `Add ${acceptedCount} space${acceptedCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      subtitle="Detected outdoor spaces from the satellite view. Review names and pick which ones to add."
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          AI · Suggest spaces
        </span>
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <SpinnerIcon className="h-6 w-6 text-accent" />
          <p className="text-sm text-text-muted">Analyzing satellite imagery…</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : drafts.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No outdoor spaces were detected in the visible area. Try zooming or panning so a field or court is in view.</p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((draft, index) => (
            <li
              className="flex items-start gap-3 rounded-card border bg-surface p-3 transition-colors data-[accepted=false]:opacity-60"
              data-accepted={draft.accepted}
              key={index}
            >
              <label className="mt-2 inline-flex">
                <Checkbox checked={draft.accepted} onChange={(event) => setDraft(index, { accepted: event.target.checked })} />
              </label>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_1fr]">
                <Input
                  aria-label="Suggestion name"
                  onChange={(event) => setDraft(index, { name: event.target.value })}
                  placeholder="Space name"
                  value={draft.name}
                />
                <Select
                  aria-label="Kind"
                  onChange={(event) => setDraft(index, { kind: asKind(event.target.value) })}
                  options={KIND_OPTIONS}
                  value={draft.kind}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Popup>
  );
}
