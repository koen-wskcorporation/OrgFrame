"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Plus, X } from "lucide-react";
import { WizardChrome } from "@/src/shared/components/CreateWizard";
import { EntityLinkPicker } from "@/src/features/org-share/components/EntityLinkPicker";
import type { ShareTarget } from "@/src/features/org-share/types";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateOccurrenceAction,
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
  resolveFacilityStatusDot,
  type FacilityBookingSelection
} from "@/src/features/calendar/components/facility-booking-utils";
import type { CalendarQuickAddDraft } from "@/src/features/calendar/components/Calendar";

export type CalendarEntryTypeOption = Extract<CalendarEntryType, "event" | "practice" | "game">;

const ALL_ENTRY_TYPES: readonly CalendarEntryTypeOption[] = ["event", "practice", "game"] as const;

// Order matters: schedule comes before location/booking so the date/time
// constraints are already set when the user opens the facility booking view.
const CREATE_SCREENS = [
  { key: "basics", label: "Basics" },
  { key: "link", label: "Link" },
  { key: "schedule", label: "Schedule" },
  { key: "location", label: "Location" }
] as const;

type CreateScreenKey = (typeof CREATE_SCREENS)[number]["key"];

const ENTRY_TYPE_LABELS: Record<CalendarEntryTypeOption, string> = {
  event: "Event",
  practice: "Practice",
  game: "Game"
};

function targetKey(target: ShareTarget) {
  return `${target.type}:${target.id}`;
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
  const [createScreen, setCreateScreen] = React.useState<CreateScreenKey>("basics");
  const [quickEntryType, setQuickEntryType] = React.useState<CalendarEntryTypeOption>(initialEntryType);
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

  const optimisticIdRef = React.useRef(0);
  const pendingOccurrenceUpdatesRef = React.useRef(new Map<string, { startsAtUtc: string; endsAtUtc: string; timezone: string }>());

  // Clear stale link errors when the type changes
  React.useEffect(() => {
    setLinkError(null);
  }, [quickEntryType]);

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
    setCreateScreen("basics");
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
    setCreateScreen("basics");
    onSelectedOccurrenceChange?.(null);
  }

  function submit() {
    if (!quickAddDraft) {
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
      if (linkRequired && !resolvedHostTeamId) {
        // game/practice need a team link; UI validation should have caught this,
        // but guard at the action boundary too.
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Team link required",
          description: `Link a team to this ${quickEntryType} before creating it.`,
          variant: "destructive"
        });
        return;
      }

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

  const isOpen = Boolean(quickAddDraft?.open);
  const showTypePicker = allowedEntryTypes.length > 1;
  const linkRequired = quickEntryType === "practice" || quickEntryType === "game";
  const allLinks = React.useMemo<ShareTarget[]>(() => [...lockedLinks, ...linkTargets], [lockedLinks, linkTargets]);
  const lockedKeys = React.useMemo(() => new Set(lockedLinks.map(targetKey)), [lockedLinks]);
  const linkStepValid = !linkRequired || allLinks.length > 0;

  const screenIndex = CREATE_SCREENS.findIndex((screen) => screen.key === createScreen);

  function removeLink(target: ShareTarget) {
    setLinkTargets((current) => current.filter((item) => targetKey(item) !== targetKey(target)));
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
            // Title is required everywhere EXCEPT the basics step when the
            // entry type is practice/game — those titles get auto-generated
            // from the linked teams on the next step. If we required a title
            // here the user would be stuck (can't type, can't advance).
            (createScreen === "basics" && quickEntryType !== "event"
              ? true
              : Boolean(quickAddDraft?.title?.trim())) &&
            (createScreen !== "link" || linkStepValid)
        )}
        currentStepId={createScreen}
        onBack={() => setCreateScreen(CREATE_SCREENS[Math.max(0, screenIndex - 1)]?.key ?? "basics")}
        onClose={close}
        onNext={() => setCreateScreen(CREATE_SCREENS[Math.min(CREATE_SCREENS.length - 1, screenIndex + 1)]?.key ?? "location")}
        onStepChange={(id) => setCreateScreen(id as CreateScreenKey)}
        onSubmit={submit}
        open={isOpen}
        steps={CREATE_SCREENS.map((screen) => ({ id: screen.key, label: screen.label }))}
        submitLabel="Create event"
        submitting={isSaving}
        subtitle="Build the event interactively: time, location, spaces, and recurrence."
        title="Create Event"
      >
        {isOpen && quickAddDraft ? (
          <ScrollableSheetBody className="space-y-4 pr-1">
            {createScreen === "basics" ? (
              <>
                {quickEntryType === "event" ? (
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
                ) : (
                  <div className="rounded-control border border-dashed border-border bg-canvas px-3 py-2 text-xs text-text-muted">
                    Title is generated from the linked team
                    {quickEntryType === "game" ? "(s) and the matchup" : ""}.
                    <span className="ml-2 font-medium text-text">{quickAddDraft.title || "—"}</span>
                  </div>
                )}

                {showTypePicker ? (
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
              </>
            ) : null}

            {createScreen === "link" ? (
              <EntityLinkPicker
                allowedTypes={["team", "division", "program"]}
                emptyHint={
                  linkRequired
                    ? `A ${quickEntryType} must be linked to at least one team, division, or program.`
                    : "Optionally link this event to teams, divisions, or programs so it shows up on their calendars."
                }
                errorMessage={linkError ?? undefined}
                lockedLinks={lockedLinks}
                onChange={(next) => {
                  setLinkTargets(next);
                  setLinkError(null);
                }}
                orgSlug={orgSlug}
                required={linkRequired}
                value={linkTargets}
              />
            ) : null}

            {createScreen === "location" ? (
              <>
                <div className="space-y-1 text-xs text-text-muted">
                  <span>Location</span>
                  <div className="flex items-stretch gap-2">
                    <div className="min-w-0 flex-1">
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
                            statusDot: resolveFacilityStatusDot(facility.status),
                            meta: facility.status === "archived" ? "Archived" : "Active"
                          })),
                          { label: "Other", value: "other" },
                          { label: "TBD", value: "tbd" }
                        ]}
                        value={locationMode === "facility" ? selectedFacilityId : locationMode}
                      />
                    </div>
                    <Button
                      disabled={locationMode !== "facility" || !selectedFacility}
                      onClick={() => setFacilityDialogOpen(true)}
                      type="button"
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4" />
                      {facilitySelections.length > 0 ? `Edit spaces (${facilitySelections.length})` : "Book spaces"}
                    </Button>
                  </div>
                </div>

                {locationMode === "other" ? (
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Address</span>
                    <UniversalAddressField onChange={setLocationDraft} value={locationDraft} />
                  </label>
                ) : null}

                {locationMode === "facility" && selectedFacility ? (
                  <div className="space-y-2 rounded-control border p-3">
                    {facilitySelections.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Selected spaces</p>
                        <div className="flex flex-wrap gap-2">
                          {facilitySelections.map((selection) => (
                            <Chip className="normal-case tracking-normal" color="neutral" key={selection.spaceId} size="compact">
                              {spaceById.get(selection.spaceId)?.name ?? selection.spaceId}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No spaces booked yet — use “Book spaces” above.</p>
                    )}
                    {selectedFacilityAddress ? <p className="text-xs text-text-muted">{selectedFacilityAddress}</p> : null}
                    {selectedFacility.status === "archived" ? (
                      <p className="text-xs text-destructive">This facility is archived.</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {createScreen === "schedule" ? (
              <>
                {/* Row 1: start date + end date side-by-side */}
                <div className="grid gap-2 sm:grid-cols-2">
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
                </div>

                {/* Row 2: start time + end time side-by-side, below dates */}
                <div className="grid gap-2 sm:grid-cols-2">
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

                <RecurringEventEditor canWrite={canWrite} draft={ruleDraft} onChange={setRuleDraft} />
              </>
            ) : null}
          </ScrollableSheetBody>
        ) : null}
      </WizardChrome>
    </>
  );

  function recordPendingMove(occurrenceId: string, window: { startsAtUtc: string; endsAtUtc: string; timezone: string }) {
    pendingOccurrenceUpdatesRef.current.set(occurrenceId, window);
  }

  return { open, close, isOpen, element, recordPendingMove };
}
