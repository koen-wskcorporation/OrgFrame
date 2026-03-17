"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Input } from "@orgframe/ui/ui/input";
import { Popup } from "@orgframe/ui/ui/popup";
import { Select } from "@orgframe/ui/ui/select";
import { cn } from "@/lib/utils";

export type ShareTargetType = "team" | "division" | "program" | "person" | "admin" | "group";

export type ShareTarget = {
  id: string;
  type: ShareTargetType;
  label: string;
  subtitle?: string;
};

type UniversalSharePopupProps = {
  open: boolean;
  onClose: () => void;
  onApply: (input: { targets: ShareTarget[]; permission: "view" | "comment" | "edit" }) => void;
  options: ShareTarget[];
  initialTargets?: ShareTarget[];
  initialPermission?: "view" | "comment" | "edit";
  title?: string;
  subtitle?: string;
  primaryActionLabel?: string;
  searchPlaceholder?: string;
  selectedLabel?: string;
  allowedTypes?: ShareTargetType[];
  allowManualPeople?: boolean;
  showPermissionControl?: boolean;
};

const FILTERS: Array<{ id: "all" | ShareTargetType; label: string }> = [
  { id: "all", label: "All" },
  { id: "team", label: "Teams" },
  { id: "division", label: "Divisions" },
  { id: "program", label: "Programs" },
  { id: "person", label: "People" },
  { id: "admin", label: "Admins" },
  { id: "group", label: "Groups" }
];

export function UniversalSharePopup({
  open,
  onClose,
  onApply,
  options,
  initialTargets = [],
  initialPermission = "view",
  title = "Share",
  subtitle = "Search and share with teams, divisions, programs, people, admins, and groups.",
  primaryActionLabel = "Share",
  searchPlaceholder = "Add people, teams, divisions, programs, admins, or groups",
  selectedLabel = "Shared with",
  allowedTypes,
  allowManualPeople = true,
  showPermissionControl = true
}: UniversalSharePopupProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ShareTargetType>("all");
  const [targets, setTargets] = useState<ShareTarget[]>(initialTargets);
  const [permission, setPermission] = useState<"view" | "comment" | "edit">(initialPermission);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTargets(
      allowedTypes && allowedTypes.length > 0
        ? initialTargets.filter((target) => allowedTypes.includes(target.type))
        : initialTargets
    );
    setPermission(initialPermission);
    setQuery("");
    setFilter(allowedTypes && allowedTypes.length === 1 ? allowedTypes[0] : "all");
  }, [allowedTypes, initialPermission, initialTargets, open]);

  const selectedIds = useMemo(() => new Set(targets.map((item) => `${item.type}:${item.id}`)), [targets]);
  const allowedTypeSet = useMemo(() => (allowedTypes ? new Set(allowedTypes) : null), [allowedTypes]);

  const visibleFilters = useMemo(() => {
    if (!allowedTypeSet) {
      return FILTERS;
    }
    const scoped = FILTERS.filter((option) => option.id === "all" || allowedTypeSet.has(option.id as ShareTargetType));
    return scoped.length > 1 ? scoped : scoped.filter((option) => option.id !== "all");
  }, [allowedTypeSet]);

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return options
      .filter((option) => (allowedTypeSet ? allowedTypeSet.has(option.type) : true))
      .filter((option) => (filter === "all" ? true : option.type === filter))
      .filter((option) => !selectedIds.has(`${option.type}:${option.id}`))
      .filter((option) =>
        trimmed ? `${option.label} ${option.subtitle ?? ""}`.toLowerCase().includes(trimmed) : true
      )
      .slice(0, 30);
  }, [allowedTypeSet, filter, options, query, selectedIds]);

  function addTarget(target: ShareTarget) {
    if (selectedIds.has(`${target.type}:${target.id}`)) {
      return;
    }
    setTargets((current) => [...current, target]);
    setQuery("");
  }

  function removeTarget(target: ShareTarget) {
    setTargets((current) => current.filter((item) => !(item.id === target.id && item.type === target.type)));
  }

  function addManualPerson() {
    if (!allowManualPeople) {
      return;
    }
    const value = query.trim();
    if (!value || !value.includes("@")) {
      return;
    }
    addTarget({
      id: value.toLowerCase(),
      type: "person",
      label: value
    });
  }

  return (
    <Popup
      onClose={onClose}
      open={open}
      size="lg"
      subtitle={subtitle}
      title={title}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-text-muted">{targets.length} recipients selected</div>
          <div className="flex gap-2">
            <Button onClick={onClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={() => {
                onApply({ targets, permission });
              }}
              type="button"
            >
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className={cn("grid gap-2", showPermissionControl ? "sm:grid-cols-[minmax(0,1fr),180px]" : "sm:grid-cols-1")}>
          <Input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addManualPerson();
              }
            }}
            placeholder={searchPlaceholder}
            value={query}
          />
          {showPermissionControl ? (
            <Select
              onChange={(event) => setPermission(event.target.value as "view" | "comment" | "edit")}
              options={[
                { label: "Can view", value: "view" },
                { label: "Can comment", value: "comment" },
                { label: "Can edit", value: "edit" }
              ]}
              value={permission}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleFilters.map((option) => (
            <button
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                filter === option.id ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:text-text"
              )}
              key={option.id}
              onClick={() => setFilter(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="rounded-control border bg-surface">
          <div className="max-h-60 overflow-auto p-2">
            {suggestions.length === 0 ? (
              <p className="px-2 py-2 text-xs text-text-muted">
                {allowManualPeople ? "No matches. Enter an email to add a person directly." : "No matches found."}
              </p>
            ) : (
              suggestions.map((option) => (
                <button
                  className="flex w-full items-center justify-between rounded-control px-2 py-2 text-left hover:bg-surface-muted"
                  key={`${option.type}:${option.id}`}
                  onClick={() => addTarget(option)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{option.label}</span>
                    {option.subtitle ? <span className="block truncate text-xs text-text-muted">{option.subtitle}</span> : null}
                  </span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">{option.type}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{selectedLabel}</p>
          {targets.length === 0 ? <p className="text-sm text-text-muted">No recipients selected yet.</p> : null}
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => (
              <button
                className="inline-flex items-center gap-2 rounded-full border bg-surface px-2.5 py-1 text-xs"
                key={`${target.type}:${target.id}`}
                onClick={() => removeTarget(target)}
                type="button"
              >
                <span className="text-text">{target.label}</span>
                <span className="text-text-muted">{target.type}</span>
                <span className="text-text-muted">×</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Popup>
  );
}
