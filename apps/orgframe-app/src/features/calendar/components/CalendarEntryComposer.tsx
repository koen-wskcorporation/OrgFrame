"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Chip } from "@orgframe/ui/primitives/chip";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Plus, X } from "lucide-react";
import { WizardChrome } from "@/src/shared/components/CreateWizard";
import { listOrgShareCatalogAction } from "@/src/features/org-share/actions";
import type { ShareTarget, ShareTargetType } from "@/src/features/org-share/types";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  deleteCalendarEntryAction,
  deleteRecurringOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateCalendarEntryAction,
  updateOccurrenceAction,
  updateRecurringOccurrenceAction,
  upsertCalendarRuleAction
} from "@/src/features/calendar/actions";
import type {
  CalendarEntry,
  CalendarEntryType,
  CalendarOccurrence,
  CalendarReadModel,
  FacilityAllocation
} from "@/src/features/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/src/features/facilities/types";
import type { ScheduleRuleDraft } from "@/src/features/programs/schedule/components/types";
import { RecurringEventEditor } from "@/src/features/calendar/components/RecurringEventEditor";
import { ScrollableSheetBody } from "@/src/features/calendar/components/ScrollableSheetBody";
import { UniversalAddressField } from "@/src/features/calendar/components/UniversalAddressField";
import { FacilityBookingFullscreen } from "@/src/features/calendar/components/FacilityBookingFullscreen";
import {
  buildCalendarRuleInputFromDraft,
  buildOccurrenceWindowsFromRuleDraft,
  buildRuleDraftFromWindow,
  syncRuleDraftWithWindow
} from "@/src/features/calendar/components/recurrence-utils";
import { toLocalParts } from "@/src/features/calendar/components/workspace-utils";
import { replaceOptimisticIds } from "@/src/features/calendar/components/workspace-utils";
import {
  buildSpaceById,
  formatFacilityLocation,
  getFacilityAddress,
  resolveRootSpaceId,
  type FacilityBookingSelection
} from "@/src/features/calendar/components/facility-booking-utils";
import type { CalendarQuickAddDraft } from "@/src/features/calendar/components/Calendar";

export type CalendarEntryTypeOption = Extract<CalendarEntryType, "event" | "practice" | "game">;

const ALL_ENTRY_TYPES: readonly CalendarEntryTypeOption[] = ["event", "practice", "game"] as const;

// Order matters: schedule comes before location/booking so the date/time
// constraints are already set when the user opens the facility booking view.
// `type` and `basics` are conditional — see `buildCreateScreens` below.
type CreateScreenKey = "type" | "basics" | "link" | "schedule" | "location";

const SCREEN_LABELS: Record<CreateScreenKey, string> = {
  type: "Type",
  basics: "Basics",
  link: "Link",
  schedule: "Schedule",
  location: "Location"
};

function buildCreateScreens(
  showTypePicker: boolean,
  entryType: CalendarEntryTypeOption,
  forceBasics = false
): Array<{ key: CreateScreenKey; label: string }> {
  const keys: CreateScreenKey[] = [];
  if (showTypePicker) keys.push("type");
  // In edit mode (forceBasics), the title is always editable — even for
  // practice/game entries that auto-generated their title at create time.
  if (entryType === "event" || forceBasics) keys.push("basics");
  keys.push("link", "location", "schedule");
  return keys.map((key) => ({ key, label: SCREEN_LABELS[key] }));
}

const ENTRY_TYPE_LABELS: Record<CalendarEntryTypeOption, string> = {
  event: "Event",
  practice: "Practice",
  game: "Game"
};

function targetKey(target: ShareTarget) {
  return `${target.type}:${target.id}`;
}

function shareTargetTypeLabel(type: ShareTargetType) {
  switch (type) {
    case "team":
      return "Team";
    case "division":
      return "Division";
    case "program":
      return "Program";
    case "person":
      return "Person";
    case "admin":
      return "Admin";
    case "group":
      return "Group";
    default:
      return type;
  }
}

function shareTargetChipColor(type: ShareTargetType) {
  switch (type) {
    case "program":
      return "yellow";
    case "division":
      return "red";
    case "team":
      return "green";
    default:
      return "neutral";
  }
}

function toLocalInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function localInputToUtcIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

// Round forward to the next half-hour boundary (e.g. 10:07 → 10:30, 10:30 → 10:30).
function nextHalfHour(now: Date): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  if (minutes === 0 || minutes === 30) return next;
  if (minutes < 30) {
    next.setMinutes(30);
  } else {
    next.setMinutes(0);
    next.setHours(next.getHours() + 1);
  }
  return next;
}

// Helpers for splitting / merging date and time portions of a UTC ISO string.
// The schedule step now shows date and time in separate rows, so we need
// fine-grained editors that only mutate one component at a time.
function toLocalDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}
function toLocalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(11, 16);
}
function mergeLocalDateTimeToUtc(dateStr: string, timeStr: string): string | null {
  if (!dateStr) return null;
  const time = timeStr || "00:00";
  return localInputToUtcIso(`${dateStr}T${time}`);
}

function resolveOrgId(model: CalendarReadModel) {
  return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.invites[0]?.orgId ?? "";
}

export type UseCalendarEntryComposerOptions = {
  orgSlug: string;
  canWrite: boolean;
  readModel: CalendarReadModel;
  setReadModel: React.Dispatch<React.SetStateAction<CalendarReadModel>>;
  facilityReadModel: FacilityReservationReadModel;

  /** Which entry types the host allows. Defaults to all three. Hidden when length === 1. */
  allowedEntryTypes?: readonly CalendarEntryTypeOption[];
  defaultEntryType?: CalendarEntryTypeOption;

  /**
   * Pre-attached link targets that cannot be removed by the user (rendered as
   * non-removable chips in the Link step). Use to encode workspace context —
   * e.g. the team workspace passes its team here so a game/practice created
   * inside it is automatically linked to that team.
   */
  lockedLinks?: ReadonlyArray<ShareTarget>;

  /** Limit facility location options to children of this root. */
  facilityRootId?: string | null;
  /** Pre-select this facility on open (e.g. the scoped space in the facility workspace). */
  defaultFacilityId?: string | null;

  /** Tag stored in occurrence metadata.createdVia. Helps audits / analytics. */
  createdViaTag?: string;

  refreshWorkspace: (message?: string) => void;
  onSelectedOccurrenceChange?: (id: string | null) => void;
  removeOptimistic: (entryId: string, occurrenceId: string) => void;
};

export type CalendarEntryComposerHandle = {
  open: (draft: CalendarQuickAddDraft) => void;
  /**
   * Open the composer in edit mode for an existing occurrence + entry. The
   * wizard renders the same step UI as create, but submit calls update
   * actions and the steps are freely navigable. Used as the unified detail /
   * edit surface across calendar workspaces.
   */
  openForEdit: (input: { occurrence: CalendarOccurrence; entry: CalendarEntry }) => void;
  close: () => void;
  isOpen: boolean;
  element: React.ReactNode;
  /**
   * Record a drag-move/resize against an optimistic occurrence that is still
   * mid-create. When the create finishes, the composer will sync the final
   * window via `updateOccurrenceAction`. Hosts that allow drag-on-optimistic
   * (e.g. the manage workspace) call this from their move/resize handlers.
   */
  recordPendingMove: (occurrenceId: string, window: { startsAtUtc: string; endsAtUtc: string; timezone: string }) => void;
};

/**
 * Single source of truth for "create a calendar entry" across the manage,
 * team, and facility workspaces. Owns wizard state, optimistic updates, and
 * the chained server actions (entry → rule|occurrence → facility allocation).
 *
 * Hosts wire the returned `open(draft)` into their `<Calendar>` create
 * gestures (onCreateRange, onQuickAddIntent, onQuickAdd) and render the
 * returned `element` once.
 */
export function useCalendarEntryComposer(options: UseCalendarEntryComposerOptions): CalendarEntryComposerHandle {
  const {
    orgSlug,
    canWrite,
    readModel,
    setReadModel,
    facilityReadModel,
    allowedEntryTypes = ALL_ENTRY_TYPES,
    defaultEntryType,
    lockedLinks = [],
    facilityRootId = null,
    defaultFacilityId = null,
    createdViaTag = "quick_add",
    refreshWorkspace,
    onSelectedOccurrenceChange,
    removeOptimistic
  } = options;

  const { toast } = useToast();
  const initialEntryType = (defaultEntryType ?? allowedEntryTypes[0] ?? "event") as CalendarEntryTypeOption;

  const [quickAddDraft, setQuickAddDraft] = React.useState<(CalendarQuickAddDraft & { open: boolean }) | null>(null);
  const [quickEntryType, setQuickEntryType] = React.useState<CalendarEntryTypeOption>(initialEntryType);
  const showTypePicker = allowedEntryTypes.length > 1;
  const initialScreen: CreateScreenKey = showTypePicker
    ? "type"
    : initialEntryType === "event"
      ? "basics"
      : "link";
  const [createScreen, setCreateScreen] = React.useState<CreateScreenKey>(initialScreen);
  const [shareCatalog, setShareCatalog] = React.useState<ShareTarget[] | null>(null);
  const [linkTargets, setLinkTargets] = React.useState<ShareTarget[]>([]);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [locationDraft, setLocationDraft] = React.useState("");
  const [locationMode, setLocationMode] = React.useState<"tbd" | "other" | "facility">("tbd");
  const [selectedFacilityId, setSelectedFacilityId] = React.useState<string>("");
  const [facilitySelections, setFacilitySelections] = React.useState<FacilityBookingSelection[]>([]);
  const [facilityDialogOpen, setFacilityDialogOpen] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState<ScheduleRuleDraft>(() =>
    buildRuleDraftFromWindow(
      new Date().toISOString(),
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
  );
  const [isSaving, startSaving] = React.useTransition();

  // Edit mode — when set, the wizard is editing an existing entry/occurrence
  // instead of creating a new one. Submit dispatches update actions and the
  // stepper is freely navigable.
  const [editing, setEditing] = React.useState<{
    occurrence: CalendarOccurrence;
    entry: CalendarEntry;
  } | null>(null);
  const [editScope, setEditScope] = React.useState<"occurrence" | "following" | "series">("series");

  const optimisticIdRef = React.useRef(0);
  const pendingOccurrenceUpdatesRef = React.useRef(new Map<string, { startsAtUtc: string; endsAtUtc: string; timezone: string }>());

  // Clear stale link errors when the type changes
  React.useEffect(() => {
    setLinkError(null);
  }, [quickEntryType]);

  // Background-load the share catalog once the wizard opens, so the link step
  // is ready by the time the user reaches it. Cached by orgSlug.
  const wizardOpen = Boolean(quickAddDraft?.open);
  React.useEffect(() => {
    if (!wizardOpen || shareCatalog !== null) return;
    let cancelled = false;
    listOrgShareCatalogAction({ orgSlug, requestedTypes: ["team", "division", "program"] })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setShareCatalog([]);
          return;
        }
        setShareCatalog(result.data.options);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, wizardOpen, shareCatalog]);

  // Auto-generate the title for non-event entries from the linked entities.
  // Event titles remain user-controlled; switching back to "event" preserves
  // whatever title was last visible so the user has something to edit.
  React.useEffect(() => {
    if (!quickAddDraft?.open || quickEntryType === "event") {
      return;
    }
    const linked = [...lockedLinks, ...linkTargets];
    if (linked.length === 0) {
      // No links yet → leave the title empty so the link step blocks Next.
      setQuickAddDraft((current) => (current ? { ...current, title: "", open: true } : current));
      return;
    }
    const teams = linked.filter((target) => target.type === "team");
    const primary = teams[0] ?? linked[0]!;
    let generated: string;
    if (quickEntryType === "game" && teams.length >= 2) {
      generated = `${teams[0]!.label} vs ${teams[1]!.label}`;
    } else {
      const suffix = quickEntryType === "practice" ? "practice" : "game";
      generated = `${primary.label} ${suffix}`;
    }
    setQuickAddDraft((current) => (current && current.title !== generated ? { ...current, title: generated, open: true } : current));
  }, [linkTargets, lockedLinks, quickAddDraft?.open, quickEntryType]);

  // Sync recurring rule draft to draft window
  React.useEffect(() => {
    if (!quickAddDraft?.open) {
      setLocationDraft("");
      setLocationMode("tbd");
      setSelectedFacilityId("");
      setFacilitySelections([]);
      return;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setRuleDraft((current) => syncRuleDraftWithWindow(current, quickAddDraft.startsAtUtc, quickAddDraft.endsAtUtc, timezone));
  }, [quickAddDraft?.endsAtUtc, quickAddDraft?.open, quickAddDraft?.startsAtUtc]);

  const spaceById = React.useMemo(() => buildSpaceById(facilityReadModel.spaces), [facilityReadModel.spaces]);
  const facilityById = React.useMemo(
    () => new Map(facilityReadModel.facilities.map((facility) => [facility.id, facility])),
    [facilityReadModel.facilities]
  );
  const facilityOptions = React.useMemo(() => {
    const candidates = facilityReadModel.facilities.filter((facility) => facility.status !== "archived");
    if (facilityRootId) {
      // Scope the dropdown to a single facility (workspace-level lock).
      return candidates.filter((facility) => facility.id === facilityRootId);
    }
    return candidates;
  }, [facilityReadModel.facilities, facilityRootId]);

  const selectedFacility = selectedFacilityId ? facilityById.get(selectedFacilityId) ?? null : null;
  const selectedFacilitySpaces = React.useMemo(
    () => facilitySelections.map((selection) => spaceById.get(selection.spaceId)).filter((space): space is FacilitySpace => Boolean(space)),
    [facilitySelections, spaceById]
  );
  const selectedFacilityAddress = React.useMemo(() => getFacilityAddress(selectedFacility), [selectedFacility]);

  // Auto-fill location label when a facility is chosen
  React.useEffect(() => {
    if (locationMode === "facility" && selectedFacility) {
      const label = formatFacilityLocation(selectedFacility, selectedFacilitySpaces);
      setLocationDraft(label || selectedFacility.name);
      return;
    }
    if (locationMode === "tbd") {
      setLocationDraft("");
    }
  }, [locationMode, selectedFacility, selectedFacilitySpaces]);

  const bookingWindows = React.useMemo(() => {
    if (!quickAddDraft?.open) {
      return [];
    }
    if (ruleDraft.repeatEnabled) {
      return buildOccurrenceWindowsFromRuleDraft({ draft: ruleDraft, entryId: "draft" });
    }
    return [
      {
        occurrenceId: "draft",
        startsAtUtc: quickAddDraft.startsAtUtc,
        endsAtUtc: quickAddDraft.endsAtUtc,
        label: "Draft"
      }
    ];
  }, [quickAddDraft?.endsAtUtc, quickAddDraft?.open, quickAddDraft?.startsAtUtc, ruleDraft]);

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function open(draft: CalendarQuickAddDraft) {
    onSelectedOccurrenceChange?.(null);
    setQuickAddDraft({ ...draft, open: true });
    const startType = (defaultEntryType ?? allowedEntryTypes[0] ?? "event") as CalendarEntryTypeOption;
    setCreateScreen(showTypePicker ? "type" : startType === "event" ? "basics" : "link");
    if (defaultFacilityId) {
      setLocationMode("facility");
      setSelectedFacilityId(defaultFacilityId);
    } else {
      setLocationMode("tbd");
      setSelectedFacilityId("");
    }
    setLocationDraft("");
    setFacilitySelections([]);
    setLinkTargets([]);
    setLinkError(null);
    if (allowedEntryTypes.length === 1) {
      setQuickEntryType(allowedEntryTypes[0]!);
    } else if (defaultEntryType) {
      setQuickEntryType(defaultEntryType);
    }
  }

  function close() {
    setQuickAddDraft(null);
    setCreateScreen(initialScreen);
    setEditing(null);
    onSelectedOccurrenceChange?.(null);
  }

  function openForEdit({ occurrence, entry }: { occurrence: CalendarOccurrence; entry: CalendarEntry }) {
    onSelectedOccurrenceChange?.(occurrence.id);

    // Hydrate the wizard state from the entity. The wizard renders the same
    // step UI; in edit mode the stepper is freely navigable and submit calls
    // update actions instead of create actions.
    setQuickAddDraft({
      title: entry.title,
      startsAtUtc: occurrence.startsAtUtc,
      endsAtUtc: occurrence.endsAtUtc,
      open: true
    });
    setQuickEntryType(entry.entryType as CalendarEntryTypeOption);

    // Links: hydrate from settings_json.links + the host team if present.
    const settingsLinksRaw = (entry.settingsJson as Record<string, unknown> | undefined)?.links;
    const settingsLinks: ShareTarget[] = Array.isArray(settingsLinksRaw)
      ? settingsLinksRaw
          .map((target) => {
            if (!target || typeof target !== "object") return null;
            const candidate = target as Record<string, unknown>;
            if (typeof candidate.id !== "string" || typeof candidate.type !== "string" || typeof candidate.label !== "string") return null;
            return { id: candidate.id, type: candidate.type as ShareTarget["type"], label: candidate.label } satisfies ShareTarget;
          })
          .filter((target): target is ShareTarget => target !== null)
      : [];
    setLinkTargets(settingsLinks);
    setLinkError(null);

    // Location: pre-populate from entry settings_json.location and any
    // existing facility allocations.
    const existingAllocations = readModel.allocations.filter((allocation) => allocation.occurrenceId === occurrence.id);
    if (existingAllocations.length > 0) {
      const firstSpaceId = existingAllocations[0]!.spaceId;
      const rootId = resolveRootSpaceId(firstSpaceId, spaceById);
      if (rootId) {
        setLocationMode("facility");
        setSelectedFacilityId(rootId);
      } else {
        setLocationMode("tbd");
        setSelectedFacilityId("");
      }
      setFacilitySelections(
        existingAllocations.map((allocation) => ({
          spaceId: allocation.spaceId,
          configurationId: allocation.configurationId,
          lockMode: allocation.lockMode,
          allowShared: allocation.allowShared,
          notes: typeof (allocation.metadataJson as Record<string, unknown> | undefined)?.notes === "string"
            ? ((allocation.metadataJson as Record<string, unknown>).notes as string)
            : undefined
        }))
      );
    } else {
      const rawLocation = (entry.settingsJson as Record<string, unknown> | undefined)?.location;
      const trimmed = typeof rawLocation === "string" ? rawLocation.trim() : "";
      if (trimmed) {
        setLocationMode("other");
        setLocationDraft(trimmed);
      } else {
        setLocationMode("tbd");
        setLocationDraft("");
      }
      setSelectedFacilityId("");
      setFacilitySelections([]);
    }

    // Recurrence: rebuild the rule draft from the occurrence window. The
    // schedule step shows a scope select when sourceRuleId is set.
    setRuleDraft(syncRuleDraftWithWindow(
      buildRuleDraftFromWindow(occurrence.startsAtUtc, occurrence.endsAtUtc, occurrence.timezone),
      occurrence.startsAtUtc,
      occurrence.endsAtUtc,
      occurrence.timezone
    ));
    setEditScope("series");

    setEditing({ occurrence, entry });
    // Edit mode opens on basics so the user lands on the most-edited fields
    // (title for events; for practice/game basics is hidden but the stepper
    // is free-nav so they can jump anywhere immediately).
    setCreateScreen(entry.entryType === "event" ? "basics" : "link");
  }

  function submit() {
    if (!quickAddDraft) {
      return;
    }

    if (editing) {
      submitEdit();
      return;
    }

    const linkRequired = quickEntryType === "practice" || quickEntryType === "game";
    const allLinks: ShareTarget[] = [...lockedLinks, ...linkTargets];
    if (linkRequired && allLinks.length === 0) {
      setLinkError(`A ${quickEntryType} must be linked to a team, division, or program.`);
      setCreateScreen("link");
      return;
    }

    const draft = quickAddDraft;
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const isRecurring = ruleDraft.repeatEnabled;
    const locationValue = locationDraft.trim();
    const resolvedHostTeamId = allLinks.find((target) => target.type === "team")?.id ?? null;

    // Server-payload mapping (matches the legacy submit logic in all three workspaces)
    const purpose = quickEntryType === "game" ? "games" : quickEntryType === "practice" ? "practices" : "custom_other";
    const visibility = quickEntryType === "practice" ? "internal" : "published";
    const entryAudience = quickEntryType === "practice" ? "staff" : "public";

    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      sourceId: null,
      entryType: quickEntryType,
      purpose,
      audience: visibility === "published" ? "public" : "private_internal",
      title: draft.title,
      summary: "",
      visibility,
      status: "scheduled",
      hostTeamId: resolvedHostTeamId,
      defaultTimezone: timezone,
      settingsJson: {
        location: locationValue || null,
        links: allLinks.length > 0 ? allLinks.map((target) => ({ id: target.id, type: target.type, label: target.label })) : null
      },
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    const optimisticOccurrence: CalendarOccurrence = {
      id: optimisticOccurrenceId,
      orgId: resolveOrgId(readModel),
      entryId: optimisticEntryId,
      sourceRuleId: null,
      sourceType: isRecurring ? "rule" : "single",
      sourceKey: `optimistic:${optimisticOccurrenceId}`,
      timezone,
      localDate: startParts.localDate,
      localStartTime: startParts.localTime,
      localEndTime: endParts.localTime,
      startsAtUtc: draft.startsAtUtc,
      endsAtUtc: draft.endsAtUtc,
      status: "scheduled",
      metadataJson: { createdVia: createdViaTag, optimistic: true },
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    };

    const optimisticAllocations: FacilityAllocation[] = facilitySelections.map((selection) => ({
      id: buildOptimisticId("optimistic-allocation"),
      orgId: resolveOrgId(readModel),
      occurrenceId: optimisticOccurrenceId,
      spaceId: selection.spaceId,
      configurationId: selection.configurationId ?? "optimistic-config",
      lockMode: selection.lockMode ?? "exclusive",
      allowShared: selection.allowShared ?? false,
      startsAtUtc: draft.startsAtUtc,
      endsAtUtc: draft.endsAtUtc,
      isActive: true,
      metadataJson: selection.notes ? { notes: selection.notes } : {},
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    }));

    pendingOccurrenceUpdatesRef.current.set(optimisticOccurrenceId, {
      startsAtUtc: draft.startsAtUtc,
      endsAtUtc: draft.endsAtUtc,
      timezone
    });

    setReadModel((current) => ({
      ...current,
      entries: [...current.entries, optimisticEntry],
      occurrences: [...current.occurrences, optimisticOccurrence],
      allocations: optimisticAllocations.length > 0 ? [...current.allocations, ...optimisticAllocations] : current.allocations
    }));
    onSelectedOccurrenceChange?.(optimisticOccurrenceId);

    startSaving(async () => {
      const entryResult = await createCalendarEntryAction({
        orgSlug,
        sourceId: null,
        purpose,
        audience: entryAudience,
        entryType: quickEntryType,
        title: draft.title,
        summary: "",
        visibility,
        status: "scheduled",
        hostTeamId: resolvedHostTeamId,
        timezone,
        location: locationValue
      });

      if (!entryResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Unable to create entry",
          description: entryResult.error,
          variant: "destructive"
        });
        return;
      }

      if (isRecurring) {
        pendingOccurrenceUpdatesRef.current.delete(optimisticOccurrenceId);
        const ruleInput = buildCalendarRuleInputFromDraft({ draft: ruleDraft, entryId: entryResult.data.entryId });
        const ruleResult = await upsertCalendarRuleAction({
          orgSlug,
          entryId: entryResult.data.entryId,
          mode: ruleInput.mode,
          timezone: ruleInput.timezone,
          startDate: ruleInput.startDate,
          endDate: ruleInput.endDate,
          startTime: ruleInput.startTime,
          endTime: ruleInput.endTime,
          intervalCount: ruleInput.intervalCount,
          intervalUnit: ruleInput.intervalUnit,
          byWeekday: ruleInput.byWeekday,
          byMonthday: ruleInput.byMonthday,
          endMode: ruleInput.endMode,
          untilDate: ruleInput.untilDate,
          maxOccurrences: ruleInput.maxOccurrences,
          configJson: ruleInput.configJson
        });

        if (!ruleResult.ok) {
          removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
          toast({
            title: "Unable to create schedule rule",
            description: ruleResult.error,
            variant: "destructive"
          });
          refreshWorkspace();
          return;
        }

        if (facilitySelections.length > 0) {
          const allocationResult = await setRuleFacilityAllocationsAction({
            orgSlug,
            ruleId: ruleResult.data.ruleId,
            allocations: facilitySelections
          });
          if (!allocationResult.ok) {
            toast({
              title: "Unable to reserve facility spaces",
              description: allocationResult.error,
              variant: "destructive"
            });
          } else if (allocationResult.data.conflicts.length > 0) {
            toast({
              title: "Some occurrences have facility conflicts",
              description: "Conflicting spaces were skipped for those occurrences.",
              variant: "info"
            });
          }
        }

        close();
        refreshWorkspace("Calendar rule created");
        return;
      }

      const occurrenceResult = await createManualOccurrenceAction({
        orgSlug,
        entryId: entryResult.data.entryId,
        timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: { createdVia: createdViaTag }
      });

      if (!occurrenceResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Unable to create occurrence",
          description: occurrenceResult.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      setReadModel((current) =>
        replaceOptimisticIds(current, {
          entryId: { from: optimisticEntryId, to: entryResult.data.entryId },
          occurrenceId: { from: optimisticOccurrenceId, to: occurrenceResult.data.occurrenceId }
        })
      );
      onSelectedOccurrenceChange?.(occurrenceResult.data.occurrenceId);

      // Sync any drag-move that happened while the optimistic occurrence was in flight
      const pending = pendingOccurrenceUpdatesRef.current.get(optimisticOccurrenceId);
      pendingOccurrenceUpdatesRef.current.delete(optimisticOccurrenceId);
      if (pending && (pending.startsAtUtc !== draft.startsAtUtc || pending.endsAtUtc !== draft.endsAtUtc)) {
        const updatedStartParts = toLocalParts(pending.startsAtUtc, pending.timezone);
        const updatedEndParts = toLocalParts(pending.endsAtUtc, pending.timezone);
        const updateResult = await updateOccurrenceAction({
          orgSlug,
          occurrenceId: occurrenceResult.data.occurrenceId,
          entryId: entryResult.data.entryId,
          timezone: pending.timezone,
          localDate: updatedStartParts.localDate,
          localStartTime: updatedStartParts.localTime,
          localEndTime: updatedEndParts.localTime,
          metadataJson: {
            ...optimisticOccurrence.metadataJson,
            movedAt: new Date().toISOString()
          }
        });
        if (!updateResult.ok) {
          toast({
            title: "Unable to sync occurrence update",
            description: updateResult.error,
            variant: "destructive"
          });
          refreshWorkspace();
          return;
        }
      }

      if (facilitySelections.length > 0) {
        const allocationResult = await setOccurrenceFacilityAllocationsAction({
          orgSlug,
          occurrenceId: occurrenceResult.data.occurrenceId,
          allocations: facilitySelections
        });
        if (!allocationResult.ok) {
          toast({
            title: "Unable to reserve facility spaces",
            description: allocationResult.error,
            variant: "destructive"
          });
        }
      }

      close();
      refreshWorkspace("Calendar item created");
    });
  }

  function submitEdit() {
    if (!editing || !quickAddDraft) return;
    const { occurrence, entry } = editing;
    const draft = quickAddDraft;
    const nextTitle = draft.title.trim();
    if (!nextTitle) {
      toast({ title: "Title required", description: "Add a title before saving.", variant: "destructive" });
      setCreateScreen("basics");
      return;
    }
    if (new Date(draft.endsAtUtc).getTime() <= new Date(draft.startsAtUtc).getTime()) {
      toast({ title: "Invalid time range", description: "End time must be after start time.", variant: "destructive" });
      setCreateScreen("schedule");
      return;
    }

    const allLinks: ShareTarget[] = [...lockedLinks, ...linkTargets];
    const resolvedHostTeamId = allLinks.find((target) => target.type === "team")?.id ?? entry.hostTeamId;
    const locationValue = locationDraft.trim();
    const startParts = toLocalParts(draft.startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(draft.endsAtUtc, occurrence.timezone);

    if (occurrence.sourceRuleId) {
      // Recurring: a single action takes the recurrence draft + scope and
      // applies the change to occurrence/following/series as the user picks.
      startSaving(async () => {
        const result = await updateRecurringOccurrenceAction({
          orgSlug,
          occurrenceId: occurrence.id,
          editScope,
          entryType: entry.entryType,
          title: nextTitle,
          summary: entry.summary ?? "",
          visibility: entry.visibility,
          status: entry.status,
          hostTeamId: resolvedHostTeamId,
          timezone: occurrence.timezone,
          location: locationValue,
          localDate: startParts.localDate,
          localStartTime: startParts.localTime,
          localEndTime: endParts.localTime,
          metadataJson: occurrence.metadataJson,
          recurrence: {
            mode: ruleDraft.repeatEnabled ? "repeating_pattern" : ruleDraft.mode,
            timezone: ruleDraft.timezone,
            startDate: ruleDraft.startDate,
            endDate: ruleDraft.endDate,
            startTime: ruleDraft.startTime,
            endTime: ruleDraft.endTime,
            intervalCount: ruleDraft.intervalCount,
            intervalUnit: ruleDraft.intervalUnit,
            byWeekday: ruleDraft.byWeekday,
            byMonthday: ruleDraft.byMonthday,
            endMode: ruleDraft.endMode,
            untilDate: ruleDraft.untilDate,
            maxOccurrences: ruleDraft.maxOccurrences ? Number.parseInt(ruleDraft.maxOccurrences, 10) : null,
            configJson: { specificDates: ruleDraft.specificDates }
          },
          copyForwardInvites: true,
          copyForwardFacilities: true
        });
        if (!result.ok) {
          toast({ title: "Unable to update event", description: result.error, variant: "destructive" });
          refreshWorkspace();
          return;
        }
        // Allocations are scope-bound to the rule when scope === "series";
        // for occurrence/following we re-apply per-occurrence allocations.
        if (editScope === "occurrence") {
          await setOccurrenceFacilityAllocationsAction({
            orgSlug,
            occurrenceId: occurrence.id,
            allocations: facilitySelections
          });
        }
        close();
        refreshWorkspace("Event updated");
      });
      return;
    }

    startSaving(async () => {
      const entryUpdate = await updateCalendarEntryAction({
        orgSlug,
        entryId: entry.id,
        sourceId: entry.sourceId,
        purpose: entry.purpose,
        audience: entry.audience,
        entryType: entry.entryType,
        title: nextTitle,
        summary: entry.summary ?? "",
        visibility: entry.visibility,
        status: entry.status,
        hostTeamId: resolvedHostTeamId,
        timezone: entry.defaultTimezone,
        location: locationValue
      });
      if (!entryUpdate.ok) {
        toast({ title: "Unable to update event", description: entryUpdate.error, variant: "destructive" });
        refreshWorkspace();
        return;
      }

      const occurrenceUpdate = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: occurrence.id,
        entryId: occurrence.entryId,
        timezone: occurrence.timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: occurrence.metadataJson
      });
      if (!occurrenceUpdate.ok) {
        toast({ title: "Unable to update timing", description: occurrenceUpdate.error, variant: "destructive" });
        refreshWorkspace();
        return;
      }

      const allocationResult = await setOccurrenceFacilityAllocationsAction({
        orgSlug,
        occurrenceId: occurrence.id,
        allocations: facilitySelections
      });
      if (!allocationResult.ok) {
        toast({ title: "Unable to update facility booking", description: allocationResult.error, variant: "destructive" });
      }

      close();
      refreshWorkspace("Event updated");
    });
  }

  function submitDelete() {
    if (!editing) return;
    const { occurrence, entry } = editing;
    if (typeof window !== "undefined" && !window.confirm("Delete this event?")) return;
    startSaving(async () => {
      if (occurrence.sourceRuleId) {
        const result = await deleteRecurringOccurrenceAction({
          orgSlug,
          occurrenceId: occurrence.id,
          deleteScope: editScope
        });
        if (!result.ok) {
          toast({ title: "Unable to delete event", description: result.error, variant: "destructive" });
          refreshWorkspace();
          return;
        }
      } else {
        const result = await deleteCalendarEntryAction({ orgSlug, entryId: entry.id });
        if (!result.ok) {
          toast({ title: "Unable to delete event", description: result.error, variant: "destructive" });
          refreshWorkspace();
          return;
        }
      }
      close();
      refreshWorkspace("Event deleted");
    });
  }

  const isOpen = Boolean(quickAddDraft?.open);
  const linkRequired = quickEntryType === "practice" || quickEntryType === "game";
  const allLinks = React.useMemo<ShareTarget[]>(() => [...lockedLinks, ...linkTargets], [lockedLinks, linkTargets]);
  const lockedKeys = React.useMemo(() => new Set(lockedLinks.map(targetKey)), [lockedLinks]);
  const linkStepValid = !linkRequired || allLinks.length > 0;
  // When a facility is chosen, require at least one space booking before
  // advancing past the location step.
  const locationStepValid = locationMode !== "facility" || facilitySelections.length > 0;

  const screens = React.useMemo(
    () => buildCreateScreens(showTypePicker && !editing, quickEntryType, Boolean(editing)),
    [showTypePicker, quickEntryType, editing]
  );

  // If the active screen is no longer in the list (e.g. user switched type
  // away from "event" while on "basics"), snap forward to the next valid one.
  React.useEffect(() => {
    if (!screens.some((screen) => screen.key === createScreen)) {
      setCreateScreen(screens[0]?.key ?? "link");
    }
  }, [screens, createScreen]);

  const screenIndex = screens.findIndex((screen) => screen.key === createScreen);

  function removeLink(target: ShareTarget) {
    setLinkTargets((current) => current.filter((item) => targetKey(item) !== targetKey(target)));
  }

  function openFacilityBooking() {
    // When a user opens the fullscreen picker, jump the wizard to the
    // schedule step (its panel re-docks inside the popup) and seed the
    // window with the next half-hour from "now" if the draft still holds
    // the open-time placeholder.
    const start = nextHalfHour(new Date());
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    setQuickAddDraft((current) => (current ? { ...current, startsAtUtc: startIso, endsAtUtc: endIso, open: true } : current));
    setCreateScreen("schedule");
    setFacilityDialogOpen(true);
  }

  const element = (
    <>
      {selectedFacilityId ? (
        <FacilityBookingFullscreen
          calendarReadModel={readModel}
          facilityReadModel={facilityReadModel}
          facilityRootId={selectedFacilityId}
          onClose={() => setFacilityDialogOpen(false)}
          onSelectionsChange={setFacilitySelections}
          onSuggestWindow={(next) => {
            setQuickAddDraft((current) =>
              current ? { ...current, startsAtUtc: next.startsAtUtc, endsAtUtc: next.endsAtUtc, open: true } : current
            );
          }}
          open={facilityDialogOpen}
          orgSlug={orgSlug}
          selections={facilitySelections}
          windows={bookingWindows}
        />
      ) : null}
      <WizardChrome
        canAdvance={Boolean(
          canWrite &&
            // Title is only required on the basics step (which is itself only
            // shown for "event"). Other steps don't gate on the title since
            // practice/game titles are auto-generated from links.
            (createScreen === "basics" ? Boolean(quickAddDraft?.title?.trim()) : true) &&
            (createScreen !== "link" || linkStepValid) &&
            (createScreen !== "location" || locationStepValid)
        )}
        currentStepId={createScreen}
        customFooter={
          editing ? (
            <>
              <Button intent="delete"
                disabled={!canWrite || isSaving}
                onClick={submitDelete}
                type="button"
                variant="ghost"
              >Delete</Button>
              <div className="ml-auto">
                <Button disabled={!canWrite || isSaving} loading={isSaving} onClick={submit} type="button">
                  Save changes
                </Button>
              </div>
            </>
          ) : undefined
        }
        mode={editing ? "edit" : "create"}
        onBack={() => setCreateScreen(screens[Math.max(0, screenIndex - 1)]?.key ?? screens[0]?.key ?? "link")}
        onClose={close}
        onNext={() =>
          setCreateScreen(
            screens[Math.min(screens.length - 1, screenIndex + 1)]?.key ?? screens[screens.length - 1]?.key ?? "location"
          )
        }
        onStepChange={(id) => setCreateScreen(id as CreateScreenKey)}
        onSubmit={submit}
        open={isOpen}
        steps={screens.map((screen) => ({ id: screen.key, label: screen.label }))}
        submitLabel={editing ? "Save changes" : "Create event"}
        submitting={isSaving}
        subtitle={
          editing ? "Edit any step to update this event." : "Build the event interactively: time, location, spaces, and recurrence."
        }
        title={editing ? editing.entry.title || "Edit event" : "Create Event"}
      >
        {isOpen && quickAddDraft ? (
          <ScrollableSheetBody className="space-y-4 pr-1">
            {createScreen === "type" ? (
              <label className="space-y-1 text-xs text-text-muted">
                <span>Type</span>
                <Select
                  disabled={!canWrite}
                  onChange={(event) => setQuickEntryType(event.target.value as CalendarEntryTypeOption)}
                  options={allowedEntryTypes.map((type) => ({
                    value: type,
                    label: ENTRY_TYPE_LABELS[type]
                  }))}
                  value={quickEntryType}
                />
              </label>
            ) : null}

            {createScreen === "basics" ? (
              <label className="space-y-1 text-xs text-text-muted">
                <span>Title</span>
                <Input
                  onChange={(event) =>
                    setQuickAddDraft((current) =>
                      current ? { ...current, title: event.target.value, open: true } : current
                    )
                  }
                  placeholder="Event title"
                  value={quickAddDraft.title}
                />
              </label>
            ) : null}

            {createScreen === "link" ? (
              <div className="space-y-2">
                <label className="block space-y-1 text-xs text-text-muted">
                  <span>Link To</span>
                  <Select
                    disabled={!canWrite}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!next || !shareCatalog) return;
                      const target = shareCatalog.find(
                        (item) => `${item.type}:${item.id}` === next
                      );
                      if (!target) return;
                      setLinkTargets((current) => [...current, target]);
                      setLinkError(null);
                    }}
                    options={(shareCatalog ?? [])
                      .filter((target) => {
                        const key = targetKey(target);
                        if (lockedLinks.some((locked) => targetKey(locked) === key)) return false;
                        if (linkTargets.some((picked) => targetKey(picked) === key)) return false;
                        return true;
                      })
                      .map((target) => ({
                        value: targetKey(target),
                        label: target.label,
                        chip: { label: shareTargetTypeLabel(target.type), color: shareTargetChipColor(target.type) }
                      }))}
                    placeholder="Search teams, divisions, or programs…"
                    searchable
                    value=""
                  />
                </label>

                {[...lockedLinks, ...linkTargets].length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {[...lockedLinks, ...linkTargets].map((target) => {
                      const key = targetKey(target);
                      const locked = lockedLinks.some((item) => targetKey(item) === key);
                      return (
                        <EntityChip
                          hideAvatar
                          key={key}
                          name={target.label}
                          onRemove={
                            locked
                              ? undefined
                              : () =>
                                  setLinkTargets((current) =>
                                    current.filter((item) => targetKey(item) !== key)
                                  )
                          }
                          status={{
                            label: shareTargetTypeLabel(target.type),
                            color: shareTargetChipColor(target.type),
                            showDot: false
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}

                {linkError ? <p className="text-xs text-destructive">{linkError}</p> : null}
              </div>
            ) : null}

            {createScreen === "location" ? (
              <>
                <label className="space-y-1 text-xs text-text-muted">
                  <span>Location</span>
                  <Select
                    disabled={!canWrite}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (next === "tbd") {
                        setLocationMode("tbd");
                        setLocationDraft("");
                        setSelectedFacilityId("");
                        setFacilitySelections([]);
                        return;
                      }
                      if (next === "other") {
                        setLocationMode("other");
                        setSelectedFacilityId("");
                        setFacilitySelections([]);
                        return;
                      }
                      setLocationMode("facility");
                      setSelectedFacilityId(next);
                    }}
                    options={[
                      ...facilityOptions.map((facility) => ({
                        label: facility.name,
                        value: facility.id,
                        chip: {
                          label: facility.status === "archived" ? "Archived" : "Active",
                          color: facility.status === "archived" ? "red" : "green",
                          status: true
                        }
                      })),
                      { label: "Other", value: "other" },
                      { label: "TBD", value: "tbd" }
                    ]}
                    value={locationMode === "facility" ? selectedFacilityId : locationMode}
                  />
                </label>

                {locationMode === "other" ? (
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Address</span>
                    <UniversalAddressField onChange={setLocationDraft} value={locationDraft} />
                  </label>
                ) : null}

                {locationMode === "facility" && selectedFacility ? (
                  <div className="space-y-3 rounded-control border bg-surface p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-text">{selectedFacility.name}</p>
                      {selectedFacilityAddress ? (
                        <p className="text-xs text-text-muted">{selectedFacilityAddress}</p>
                      ) : null}
                      {selectedFacility.status === "archived" ? (
                        <p className="text-xs text-destructive">This facility is archived.</p>
                      ) : null}
                    </div>

                    {facilitySelections.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Selected spaces</p>
                        <div className="flex flex-wrap gap-2">
                          {facilitySelections.map((selection) => (
                            <Chip className="normal-case tracking-normal" color="neutral" key={selection.spaceId}>
                              {spaceById.get(selection.spaceId)?.name ?? selection.spaceId}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <Button onClick={openFacilityBooking} type="button" variant="secondary">
                      <Plus className="h-4 w-4" />
                      {facilitySelections.length > 0 ? `Edit spaces (${facilitySelections.length})` : "Book spaces"}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}

            {createScreen === "schedule" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Start date</span>
                    <CalendarPicker
                      onChange={(nextDate) => {
                        const next = mergeLocalDateTimeToUtc(nextDate, toLocalTime(quickAddDraft.startsAtUtc));
                        if (!next) return;
                        setQuickAddDraft((current) => (current ? { ...current, startsAtUtc: next, open: true } : current));
                      }}
                      value={toLocalDate(quickAddDraft.startsAtUtc)}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>End date</span>
                    <CalendarPicker
                      onChange={(nextDate) => {
                        const next = mergeLocalDateTimeToUtc(nextDate, toLocalTime(quickAddDraft.endsAtUtc));
                        if (!next) return;
                        setQuickAddDraft((current) => (current ? { ...current, endsAtUtc: next, open: true } : current));
                      }}
                      value={toLocalDate(quickAddDraft.endsAtUtc)}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Start time</span>
                    <Input
                      onChange={(event) => {
                        const next = mergeLocalDateTimeToUtc(toLocalDate(quickAddDraft.startsAtUtc), event.target.value);
                        if (!next) return;
                        setQuickAddDraft((current) => (current ? { ...current, startsAtUtc: next, open: true } : current));
                      }}
                      type="time"
                      value={toLocalTime(quickAddDraft.startsAtUtc)}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>End time</span>
                    <Input
                      onChange={(event) => {
                        const next = mergeLocalDateTimeToUtc(toLocalDate(quickAddDraft.endsAtUtc), event.target.value);
                        if (!next) return;
                        setQuickAddDraft((current) => (current ? { ...current, endsAtUtc: next, open: true } : current));
                      }}
                      type="time"
                      value={toLocalTime(quickAddDraft.endsAtUtc)}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {createScreen === "schedule" && editing && editing.occurrence.sourceRuleId ? (
              <label className="space-y-1 text-xs text-text-muted">
                <span>Apply changes to</span>
                <Select
                  disabled={!canWrite}
                  onChange={(event) => setEditScope(event.target.value as "occurrence" | "following" | "series")}
                  options={[
                    { label: "This occurrence only", value: "occurrence" },
                    { label: "This and following", value: "following" },
                    { label: "Entire series", value: "series" }
                  ]}
                  value={editScope}
                />
              </label>
            ) : null}

            {createScreen === "schedule" ? (
              <RecurringEventEditor canWrite={canWrite} draft={ruleDraft} onChange={setRuleDraft} />
            ) : null}
          </ScrollableSheetBody>
        ) : null}
      </WizardChrome>
    </>
  );

  function recordPendingMove(occurrenceId: string, window: { startsAtUtc: string; endsAtUtc: string; timezone: string }) {
    pendingOccurrenceUpdatesRef.current.set(occurrenceId, window);
  }

  return { open, openForEdit, close, isOpen, element, recordPendingMove };
}
