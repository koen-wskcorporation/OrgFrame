"use client";

import { useMemo, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import type {
  CalendarAudience,
  CalendarLensKind,
  CalendarLensSavedView,
  CalendarLensState,
  CalendarPageContextType,
  CalendarPurpose,
  CalendarScopeType,
  CalendarSource,
  CalendarWhyShown
} from "@/src/features/calendar/types";

const lensOptions: Array<{ value: CalendarLensKind; label: string }> = [
  { value: "mine", label: "Mine" },
  { value: "this_page", label: "This Page" },
  { value: "public", label: "Public" },
  { value: "operations", label: "Operations" },
  { value: "custom", label: "Build Custom" }
];

const purposeOptions: Array<{ value: CalendarPurpose; label: string }> = [
  { value: "games", label: "Games" },
  { value: "practices", label: "Practices" },
  { value: "tryouts", label: "Tryouts" },
  { value: "season_dates", label: "Dates" },
  { value: "meetings", label: "Meetings" },
  { value: "fundraisers", label: "Fundraisers" },
  { value: "facilities", label: "Facilities" },
  { value: "deadlines", label: "Deadlines" },
  { value: "custom_other", label: "Custom" }
];

const audienceOptions: Array<{ value: CalendarLensState["audiencePerspective"]; label: string }> = [
  { value: "what_i_can_access", label: "What I can access" },
  { value: "public", label: "Public-facing" },
  { value: "staff", label: "Staff view" },
  { value: "coaches", label: "Coach view" },
  { value: "parents", label: "Parent view" },
  { value: "board", label: "Board view" },
  { value: "private_internal", label: "Internal only" }
];

const scopeLabels: Record<CalendarScopeType, string> = {
  organization: "Organization",
  program: "Programs",
  division: "Divisions",
  team: "Teams",
  custom: "Custom"
};

function scopeOrderForContext(contextType: CalendarPageContextType): CalendarScopeType[] {
  if (contextType === "team") {
    return ["team", "division", "program", "organization", "custom"];
  }
  if (contextType === "division") {
    return ["division", "team", "program", "organization", "custom"];
  }
  if (contextType === "program") {
    return ["program", "division", "team", "organization", "custom"];
  }
  if (contextType === "facility") {
    return ["organization", "program", "division", "team", "custom"];
  }
  return ["organization", "program", "division", "team", "custom"];
}

function toggleInArray<T extends string>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

type LensCommonProps = {
  lensState: CalendarLensState;
  onChange: (next: CalendarLensState) => void;
};

export function LensSwitcher({ lensState, onChange }: LensCommonProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {lensOptions.map((option) => (
        <Button
          key={option.value}
          onClick={() => onChange({ ...lensState, lens: option.value })}
          size="sm"
          type="button"
          variant={lensState.lens === option.value ? "primary" : "ghost"}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function ActiveLensBar({ lensState, onChange }: LensCommonProps) {
  const activeScopes = lensState.includeScopeTypes.map((scopeType) => scopeLabels[scopeType]);
  const activePurpose = purposeOptions.filter((item) => lensState.includePurpose.includes(item.value)).map((item) => item.label);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border bg-muted/30 px-2 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Active lens</span>
      <span className="rounded-full bg-surface px-2 py-1 text-xs text-text">{lensOptions.find((item) => item.value === lensState.lens)?.label}</span>
      {activeScopes.slice(0, 4).map((scope) => (
        <span className="rounded-full bg-surface px-2 py-1 text-xs text-text" key={scope}>
          {scope}
        </span>
      ))}
      {activePurpose.slice(0, 4).map((purpose) => (
        <span className="rounded-full bg-surface px-2 py-1 text-xs text-text" key={purpose}>
          {purpose}
        </span>
      ))}
      <Button onClick={() => onChange({ ...lensState, searchTerm: "" })} size="sm" type="button" variant="ghost">
        Clear search
      </Button>
    </div>
  );
}

type ScopeChipsProps = LensCommonProps & {
  contextType: CalendarPageContextType;
};

export function ScopeChips({ lensState, onChange, contextType }: ScopeChipsProps) {
  const scopeOrder = scopeOrderForContext(contextType);

  return (
    <div className="flex flex-wrap gap-2">
      {scopeOrder.map((scopeType) => {
        const selected = lensState.includeScopeTypes.includes(scopeType);
        return (
          <Button
            key={scopeType}
            onClick={() => onChange({ ...lensState, includeScopeTypes: toggleInArray(lensState.includeScopeTypes, scopeType) })}
            size="sm"
            type="button"
            variant={selected ? "primary" : "ghost"}
          >
            {scopeLabels[scopeType]}
          </Button>
        );
      })}
    </div>
  );
}

export function PurposeChips({ lensState, onChange }: LensCommonProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {purposeOptions.map((purpose) => {
        const selected = lensState.includePurpose.includes(purpose.value);
        return (
          <Button
            key={purpose.value}
            onClick={() => onChange({ ...lensState, includePurpose: toggleInArray(lensState.includePurpose, purpose.value) })}
            size="sm"
            type="button"
            variant={selected ? "primary" : "ghost"}
          >
            {purpose.label}
          </Button>
        );
      })}
    </div>
  );
}

export function AudiencePerspectiveSwitcher({ lensState, onChange }: LensCommonProps) {
  return (
    <Select
      onChange={(event) => onChange({ ...lensState, audiencePerspective: event.target.value as CalendarAudience | "what_i_can_access" })}
      options={audienceOptions}
      value={lensState.audiencePerspective}
    />
  );
}

type CalendarLayersPanelProps = LensCommonProps & {
  sources: CalendarSource[];
};

export function CalendarLayersPanel({ lensState, onChange, sources }: CalendarLayersPanelProps) {
  const grouped = useMemo(() => {
    return sources.reduce<Record<CalendarScopeType, CalendarSource[]>>(
      (acc, source) => {
        acc[source.scopeType].push(source);
        return acc;
      },
      {
        organization: [],
        program: [],
        division: [],
        team: [],
        custom: []
      }
    );
  }, [sources]);

  return (
    <div className="space-y-2 rounded-control border bg-surface p-2">
      {(["organization", "program", "division", "team", "custom"] as CalendarScopeType[]).map((scopeType) => (
        <div className="space-y-1" key={scopeType}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{scopeLabels[scopeType]}</p>
          {grouped[scopeType].length === 0 ? <p className="text-xs text-text-muted">No layers</p> : null}
          {grouped[scopeType].map((source) => {
            const hidden = lensState.excludeSourceIds.includes(source.id);
            const pinned = lensState.pinnedLayerIds.includes(source.id);
            const isolated = lensState.isolatedLayerId === source.id;
            return (
              <div className="flex items-center gap-1" key={source.id}>
                <Button
                  onClick={() => onChange({ ...lensState, excludeSourceIds: toggleInArray(lensState.excludeSourceIds, source.id) })}
                  size="sm"
                  type="button"
                  variant={hidden ? "ghost" : "primary"}
                >
                  {hidden ? "Show" : "Hide"}
                </Button>
                <Button
                  onClick={() => onChange({ ...lensState, pinnedLayerIds: toggleInArray(lensState.pinnedLayerIds, source.id) })}
                  size="sm"
                  type="button"
                  variant={pinned ? "secondary" : "ghost"}
                >
                  Pin
                </Button>
                <Button
                  onClick={() => onChange({ ...lensState, isolatedLayerId: isolated ? null : source.id })}
                  size="sm"
                  type="button"
                  variant={isolated ? "secondary" : "ghost"}
                >
                  Isolate
                </Button>
                <span className="text-sm text-text">{source.name}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type SavedViewsMenuProps = {
  contextType: CalendarPageContextType;
  lensState: CalendarLensState;
  savedViews: CalendarLensSavedView[];
  onApply: (next: CalendarLensState) => void;
  onSave: (name: string, isDefault: boolean) => void;
  onDelete: (viewId: string) => void;
  onSetDefault: (viewId: string) => void;
};

export function SavedViewsMenu({ contextType, lensState, savedViews, onApply, onSave, onDelete, onSetDefault }: SavedViewsMenuProps) {
  const [name, setName] = useState("");
  const available = savedViews.filter((view) => view.contextType === contextType || view.contextType === null);

  return (
    <div className="space-y-2 rounded-control border bg-surface p-2">
      <div className="flex gap-2">
        <Input onChange={(event) => setName(event.target.value)} placeholder="Save view name" value={name} />
        <Button
          onClick={() => {
            const trimmed = name.trim();
            if (!trimmed) {
              return;
            }
            onSave(trimmed, false);
            setName("");
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          Save
        </Button>
      </div>
      <Select
        onChange={(event) => {
          const selected = available.find((view) => view.id === event.target.value);
          if (!selected) {
            return;
          }
          onApply(selected.configJson);
        }}
        options={available.map((view) => ({
          value: view.id,
          label: view.isDefault ? `${view.name} (default)` : view.name
        }))}
        placeholder="Load saved view"
        value={lensState.savedViewId ?? undefined}
      />
      {available.map((view) => (
        <div className="flex items-center justify-between text-xs text-text-muted" key={view.id}>
          <span>{view.name}</span>
          <div className="flex gap-1">
            <Button onClick={() => onSetDefault(view.id)} size="sm" type="button" variant="ghost">
              Default
            </Button>
            <Button onClick={() => onDelete(view.id)} size="sm" type="button" variant="ghost">
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

type WhyShownInspectorProps = {
  whyShown: CalendarWhyShown | null;
};

export function WhyShownInspector({ whyShown }: WhyShownInspectorProps) {
  if (!whyShown) {
    return <p className="text-xs text-text-muted">Select an event to inspect why it appears in this lens.</p>;
  }

  return (
    <div className="space-y-1 rounded-control border bg-surface p-2 text-xs text-text-muted">
      <p>
        Source: <span className="text-text">{whyShown.sourceName ?? "Unassigned"}</span>
      </p>
      <p>
        Scope: <span className="text-text">{whyShown.scopeType ?? "Unknown"}</span>
      </p>
      <p>
        Purpose: <span className="text-text">{whyShown.purpose}</span>
      </p>
      <p>
        Audience: <span className="text-text">{whyShown.audience}</span>
      </p>
      <p className="text-[11px]">{whyShown.reasonCodes.join(" · ")}</p>
    </div>
  );
}

type CalendarLensExplorerProps = {
  title?: string;
  description?: string;
  contextType: CalendarPageContextType;
  sources: CalendarSource[];
  lensState: CalendarLensState;
  onLensStateChange: (next: CalendarLensState) => void;
  savedViews: CalendarLensSavedView[];
  onSaveView: (name: string, isDefault: boolean) => void;
  onDeleteView: (viewId: string) => void;
  onSetDefaultView: (viewId: string) => void;
  whyShown: CalendarWhyShown | null;
};

export function CalendarLensExplorer({
  title = "Calendar Explorer",
  description = "Build composable calendar lenses with scope, purpose, audience, layers, and saved views.",
  contextType,
  sources,
  lensState,
  onLensStateChange,
  savedViews,
  onSaveView,
  onDeleteView,
  onSetDefaultView,
  whyShown
}: CalendarLensExplorerProps) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <LensSwitcher lensState={lensState} onChange={onLensStateChange} />
        <ActiveLensBar lensState={lensState} onChange={onLensStateChange} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <ScopeChips contextType={contextType} lensState={lensState} onChange={onLensStateChange} />
          <PurposeChips lensState={lensState} onChange={onLensStateChange} />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <AudiencePerspectiveSwitcher lensState={lensState} onChange={onLensStateChange} />
          <Input
            onChange={(event) => onLensStateChange({ ...lensState, searchTerm: event.target.value })}
            placeholder="Search event titles"
            value={lensState.searchTerm}
          />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <CalendarLayersPanel lensState={lensState} onChange={onLensStateChange} sources={sources} />
          <div className="space-y-2">
            <SavedViewsMenu
              contextType={contextType}
              lensState={lensState}
              onApply={onLensStateChange}
              onDelete={onDeleteView}
              onSave={onSaveView}
              onSetDefault={onSetDefaultView}
              savedViews={savedViews}
            />
            <WhyShownInspector whyShown={whyShown} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
