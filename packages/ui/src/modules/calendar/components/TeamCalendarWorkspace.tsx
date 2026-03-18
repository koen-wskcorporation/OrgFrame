"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { CalendarPicker } from "@orgframe/ui/ui/calendar-picker";
import { Input } from "@orgframe/ui/ui/input";
import { Panel, PanelScreens } from "@orgframe/ui/ui/panel";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  deleteRecurringOccurrenceAction,
  deleteOccurrenceAction,
  getCalendarWorkspaceDataAction,
  leaveSharedOccurrenceAction,
  respondToTeamInviteAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateCalendarEntryAction,
  updateRecurringOccurrenceAction,
  updateOccurrenceAction,
  upsertCalendarRuleAction
} from "@/modules/calendar/actions";
import type {
  CalendarEntry,
  CalendarOccurrence,
  CalendarReadModel,
  FacilityAllocation,
  OccurrenceTeamInvite
} from "@/modules/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/modules/facilities/types";
import { RecurringEventEditor } from "@orgframe/ui/modules/calendar/components/RecurringEventEditor";
import {
  buildCalendarRuleInputFromDraft,
  buildOccurrenceWindowsFromRuleDraft,
  buildRuleDraftFromWindow,
  scheduleDraftFromCalendarRule,
  syncRuleDraftWithWindow
} from "@orgframe/ui/modules/calendar/components/recurrence-utils";
import type { ScheduleRuleDraft } from "@orgframe/ui/modules/programs/schedule/components/types";
import { generateOccurrencesForRule } from "@/modules/calendar/rule-engine";
import {
  buildTeamLabelById,
  buildInitialSelectedSourceIds,
  filterCalendarReadModelBySelectedSources,
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@orgframe/ui/modules/calendar/components/workspace-utils";
import { FacilityBookingDialog } from "@orgframe/ui/modules/calendar/components/FacilityBookingDialog";
import { CalendarSourceFilterPopover } from "@orgframe/ui/modules/calendar/components/CalendarSourceFilterPopover";
import { ScrollableSheetBody } from "@orgframe/ui/modules/calendar/components/ScrollableSheetBody";
import { UniversalAddressField } from "@orgframe/ui/modules/calendar/components/UniversalAddressField";
import {
  buildSpaceById,
  computeFacilityConflicts,
  formatFacilityLocation,
  getFacilityAddress,
  resolveRootSpaceId,
  resolveFacilityStatusDot,
  type FacilityBookingSelection,
  type FacilityBookingWindow
} from "@orgframe/ui/modules/calendar/components/facility-booking-utils";

function resolveEntryLocation(entry: CalendarEntry | null) {
  if (!entry) {
    return "";
  }
  const location = entry.settingsJson?.location;
  return typeof location === "string" ? location : "";
}

function toLocalInputValue(isoUtc: string) {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToUtcIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

type TeamCalendarWorkspaceProps = {
  orgSlug: string;
  teamId: string;
  teamLabel?: string;
  activeTeams?: Array<{ id: string; label: string }>;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
};

export function TeamCalendarWorkspace({
  orgSlug,
  teamId,
  teamLabel,
  activeTeams = [],
  canWrite,
  initialReadModel,
  initialFacilityReadModel
}: TeamCalendarWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [facilityReadModel, setFacilityReadModel] = useState<FacilityReservationReadModel>(
    initialFacilityReadModel ?? {
      spaces: [],
      rules: [],
      reservations: [],
      exceptions: []
    }
  );
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => buildInitialSelectedSourceIds(initialReadModel.sources));
  const [quickAddDraft, setQuickAddDraft] = useState<(UnifiedCalendarQuickAddDraft & { open: boolean }) | null>(null);
  const [createScreen, setCreateScreen] = useState<"basics" | "location" | "schedule">("basics");
  const [locationDraft, setLocationDraft] = useState("");
  const [locationMode, setLocationMode] = useState<"tbd" | "other" | "facility">("tbd");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("");
  const [facilitySelections, setFacilitySelections] = useState<FacilityBookingSelection[]>([]);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState<"quick-add" | "edit-occurrence" | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStartsAtLocal, setEditStartsAtLocal] = useState("");
  const [editEndsAtLocal, setEditEndsAtLocal] = useState("");
  const [editLocationDraft, setEditLocationDraft] = useState("");
  const [editScope, setEditScope] = useState<"occurrence" | "following" | "series">("series");
  const [pendingRecurringMutation, setPendingRecurringMutation] = useState<{
    type: "delete";
    occurrenceId: string;
  } | null>(null);
  const [pendingRecurringScope, setPendingRecurringScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const [ruleDraft, setRuleDraft] = useState<ScheduleRuleDraft>(() =>
    buildRuleDraftFromWindow(new Date().toISOString(), new Date(Date.now() + 60 * 60 * 1000).toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)
  );
  const optimisticIdRef = useRef(0);
  const [, startSaving] = useTransition();

  const teamInvites = useMemo(
    () => readModel.invites.filter((invite) => invite.teamId === teamId && ["accepted", "pending", "left", "declined"].includes(invite.inviteStatus)),
    [readModel.invites, teamId]
  );

  const scopedReadModel = useMemo(() => {
    const occurrenceIds = new Set(teamInvites.map((invite) => invite.occurrenceId));
    return {
      ...readModel,
      occurrences: readModel.occurrences.filter((occurrence) => occurrenceIds.has(occurrence.id))
    };
  }, [readModel, teamInvites]);
  const filteredReadModel = useMemo(
    () => filterCalendarReadModelBySelectedSources(scopedReadModel, selectedSourceIds),
    [scopedReadModel, selectedSourceIds]
  );

  const teamLabelById = useMemo(() => {
    const map = buildTeamLabelById(activeTeams);
    if (!map.has(teamId) && teamLabel?.trim()) {
      const normalized = teamLabel
        .split("/")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .join("/");
      if (normalized) {
        map.set(teamId, normalized);
      }
    }
    return map;
  }, [activeTeams, teamId, teamLabel]);

  const items = useMemo(() => toCalendarItems(filteredReadModel, { teamLabelById }), [filteredReadModel, teamLabelById]);

  const spaceById = useMemo(() => buildSpaceById(facilityReadModel.spaces), [facilityReadModel.spaces]);
  const facilityOptions = useMemo(
    () => facilityReadModel.spaces.filter((space) => space.parentSpaceId === null && space.status !== "archived"),
    [facilityReadModel.spaces]
  );
  const selectedFacility = selectedFacilityId ? spaceById.get(selectedFacilityId) ?? null : null;
  const selectedFacilitySpaces = useMemo(
    () => facilitySelections.map((selection) => spaceById.get(selection.spaceId)).filter((space): space is FacilitySpace => Boolean(space)),
    [facilitySelections, spaceById]
  );
  const selectedFacilityAddress = useMemo(() => getFacilityAddress(selectedFacility), [selectedFacility]);

  useEffect(() => {
    if (!quickAddDraft?.open) {
      setLocationDraft("");
      setLocationMode("tbd");
      setSelectedFacilityId("");
      setFacilitySelections([]);
      setBookingMode(null);
      return;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startValue = quickAddDraft.startsAtUtc;
    const endValue = quickAddDraft.endsAtUtc;

    setRuleDraft((current) => syncRuleDraftWithWindow(current, startValue, endValue, timezone));
  }, [quickAddDraft?.endsAtUtc, quickAddDraft?.open, quickAddDraft?.startsAtUtc]);

  useEffect(() => {
    if (locationMode === "facility" && selectedFacility) {
      const label = formatFacilityLocation(selectedFacility, selectedFacilitySpaces);
      setLocationDraft(label || selectedFacility.name);
      return;
    }
    if (locationMode === "tbd") {
      setLocationDraft("");
    }
  }, [locationMode, selectedFacility, selectedFacilitySpaces]);

  const selectedOccurrence = useMemo(() => (selectedOccurrenceId ? findOccurrence(readModel, selectedOccurrenceId) : null), [readModel, selectedOccurrenceId]);
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(readModel, selectedOccurrence) : null),
    [readModel, selectedOccurrence]
  );
  const selectedAllocations = useMemo(
    () => (selectedOccurrence ? readModel.allocations.filter((allocation) => allocation.occurrenceId === selectedOccurrence.id) : []),
    [readModel.allocations, selectedOccurrence]
  );
  const selectedLocation = useMemo(() => resolveEntryLocation(selectedEntry), [selectedEntry]);

  const selectedInvite = useMemo(
    () => (selectedOccurrence ? teamInvites.find((invite) => invite.occurrenceId === selectedOccurrence.id) ?? null : null),
    [selectedOccurrence, teamInvites]
  );

  useEffect(() => {
    if (!selectedOccurrence || !selectedEntry) {
      setEditTitle("");
      setEditStartsAtLocal("");
      setEditEndsAtLocal("");
      setEditLocationDraft("");
      return;
    }

    setEditTitle(selectedEntry.title);
    setEditStartsAtLocal(toLocalInputValue(selectedOccurrence.startsAtUtc));
    setEditEndsAtLocal(toLocalInputValue(selectedOccurrence.endsAtUtc));
    setEditLocationDraft(selectedLocation);
  }, [selectedEntry, selectedLocation, selectedOccurrence]);

  function resolveOrgId(model: CalendarReadModel) {
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.invites[0]?.orgId ?? "";
  }

  const createMode = Boolean(quickAddDraft?.open);
  const editMode = Boolean(selectedOccurrence && selectedEntry);
  const composerOpen = createMode || editMode;
  const composerTitle = createMode ? "Create Event" : selectedEntry?.title ?? "Event details";
  const composerSubtitle = createMode
    ? "Build the event interactively: type, time, location, facility spaces, and recurrence."
    : selectedOccurrence && selectedEntry
      ? `${selectedEntry.entryType} · ${selectedInvite?.inviteStatus ?? "not-invited"}`
      : "Select a calendar item to manage invites.";
  const createScreens = [
    { key: "basics", label: "Basics" },
    { key: "location", label: "Location" },
    { key: "schedule", label: "Schedule" }
  ] as const;
  const createScreenIndex = createScreens.findIndex((screen) => screen.key === createScreen);

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function removeOptimistic(optimisticEntryId: string, optimisticOccurrenceId: string) {
    setReadModel((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== optimisticEntryId),
      occurrences: current.occurrences.filter((occurrence) => occurrence.id !== optimisticOccurrenceId),
      invites: current.invites.filter((invite) => invite.occurrenceId !== optimisticOccurrenceId),
      allocations: current.allocations.filter((allocation) => allocation.occurrenceId !== optimisticOccurrenceId)
    }));
    setSelectedOccurrenceId((current) => (current === optimisticOccurrenceId ? null : current));
  }

  function upsertInviteOptimistically(input: {
    occurrenceId: string;
    teamId: string;
    role: OccurrenceTeamInvite["role"];
    inviteStatus: OccurrenceTeamInvite["inviteStatus"];
  }) {
    const now = new Date().toISOString();
    setReadModel((current) => {
      const existing = current.invites.find((invite) => invite.occurrenceId === input.occurrenceId && invite.teamId === input.teamId);
      if (existing) {
        return {
          ...current,
          invites: current.invites.map((invite) =>
            invite.occurrenceId === input.occurrenceId && invite.teamId === input.teamId
              ? {
                  ...invite,
                  role: input.role,
                  inviteStatus: input.inviteStatus,
                  updatedAt: now
                }
              : invite
          )
        };
      }

      const optimisticInvite: OccurrenceTeamInvite = {
        id: buildOptimisticId("optimistic-invite"),
        orgId: resolveOrgId(current),
        occurrenceId: input.occurrenceId,
        teamId: input.teamId,
        role: input.role,
        inviteStatus: input.inviteStatus,
        invitedByUserId: null,
        invitedAt: now,
        respondedByUserId: null,
        respondedAt: null,
        createdAt: now,
        updatedAt: now
      };

      return {
        ...current,
        invites: [...current.invites, optimisticInvite]
      };
    });
  }

  function refreshWorkspace(successTitle?: string) {
    startSaving(async () => {
      const result = await getCalendarWorkspaceDataAction({ orgSlug });
      if (!result.ok) {
        toast({
          title: "Unable to refresh team calendar",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setReadModel(result.data.readModel);
      setFacilityReadModel(result.data.facilityReadModel);
      if (successTitle) {
        toast({
          title: successTitle,
          variant: "success"
        });
      }
    });
  }

  useEffect(() => {
    setSelectedSourceIds((current) => {
      const next = new Set<string>();
      for (const source of scopedReadModel.sources) {
        if (current.has(source.id) || source.isActive) {
          next.add(source.id);
        }
      }
      return next;
    });
  }, [scopedReadModel.sources]);

  function quickAddTeamPractice(draft: UnifiedCalendarQuickAddDraft) {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const isRecurring = ruleDraft.repeatEnabled;
    const locationValue = locationDraft.trim();
    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      sourceId: null,
      entryType: "practice",
      purpose: "practices",
      audience: "team_members_only",
      title: draft.title,
      summary: "",
      visibility: "internal",
      status: "scheduled",
      hostTeamId: teamId,
      defaultTimezone: timezone,
      settingsJson: {
        location: locationValue || null
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
      metadataJson: {
        createdVia: "team_workspace",
        optimistic: true
      },
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

    setReadModel((current) => ({
      ...current,
      entries: [...current.entries, optimisticEntry],
      occurrences: [...current.occurrences, optimisticOccurrence],
      allocations: optimisticAllocations.length > 0 ? [...current.allocations, ...optimisticAllocations] : current.allocations
    }));
    setSelectedOccurrenceId(optimisticOccurrenceId);

    startSaving(async () => {
      const entryResult = await createCalendarEntryAction({
        orgSlug,
        sourceId: null,
        purpose: "practices",
        audience: "team_members_only",
        entryType: "practice",
        title: draft.title,
        summary: "",
        visibility: "internal",
        status: "scheduled",
        hostTeamId: teamId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: locationValue
      });

      if (!entryResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Unable to create practice",
          description: entryResult.error,
          variant: "destructive"
        });
        return;
      }

      if (isRecurring) {
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

        refreshWorkspace("Team practice schedule created");
        return;
      }

      const occurrenceResult = await createManualOccurrenceAction({
        orgSlug,
        entryId: entryResult.data.entryId,
        timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: {
          createdVia: "team_workspace"
        }
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
      setSelectedOccurrenceId((current) => (current === optimisticOccurrenceId ? occurrenceResult.data.occurrenceId : current));

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

      refreshWorkspace("Team practice created");
    });
  }

  function openCreateComposer(draft: UnifiedCalendarQuickAddDraft) {
    setSelectedOccurrenceId(null);
    setQuickAddDraft({ ...draft, open: true });
    setCreateScreen("basics");
    setLocationMode("tbd");
    setLocationDraft("");
    setSelectedFacilityId("");
    setFacilitySelections([]);
    setBookingMode("quick-add");
  }

  function closeComposer() {
    setQuickAddDraft(null);
    setSelectedOccurrenceId(null);
    setCreateScreen("basics");
  }

  function submitCreateComposer() {
    if (!quickAddDraft) {
      return;
    }

    const title = quickAddDraft.title.trim();
    if (!title) {
      toast({
        title: "Title required",
        description: "Add a title before creating this event.",
        variant: "destructive"
      });
      return;
    }

    if (new Date(quickAddDraft.endsAtUtc).getTime() <= new Date(quickAddDraft.startsAtUtc).getTime()) {
      toast({
        title: "Invalid time range",
        description: "End time must be after start time.",
        variant: "destructive"
      });
      return;
    }

    quickAddTeamPractice({
      title,
      startsAtUtc: quickAddDraft.startsAtUtc,
      endsAtUtc: quickAddDraft.endsAtUtc
    });
    setQuickAddDraft(null);
    setCreateScreen("basics");
  }

  function submitEditComposer() {
    if (!selectedOccurrence || !selectedEntry || selectedInvite?.role !== "host") {
      return;
    }

    const nextStartsAtUtc = localInputToUtcIso(editStartsAtLocal);
    const nextEndsAtUtc = localInputToUtcIso(editEndsAtLocal);
    const nextTitle = editTitle.trim();
    if (!nextStartsAtUtc || !nextEndsAtUtc || new Date(nextEndsAtUtc).getTime() <= new Date(nextStartsAtUtc).getTime()) {
      toast({
        title: "Invalid time range",
        description: "End time must be after start time.",
        variant: "destructive"
      });
      return;
    }
    if (!nextTitle) {
      toast({
        title: "Title required",
        description: "Add a title before saving.",
        variant: "destructive"
      });
      return;
    }

    const now = new Date().toISOString();
    const nextStartParts = toLocalParts(nextStartsAtUtc, selectedOccurrence.timezone);
    const nextEndParts = toLocalParts(nextEndsAtUtc, selectedOccurrence.timezone);

    if (selectedOccurrence.sourceRuleId) {
      startSaving(async () => {
        const recurringResult = await updateRecurringOccurrenceAction({
          orgSlug,
          occurrenceId: selectedOccurrence.id,
          editScope,
          entryType: selectedEntry.entryType,
          title: nextTitle,
          summary: selectedEntry.summary ?? "",
          visibility: selectedEntry.visibility,
          status: selectedEntry.status,
          hostTeamId: selectedEntry.hostTeamId,
          timezone: selectedOccurrence.timezone,
          location: editLocationDraft.trim(),
          localDate: nextStartParts.localDate,
          localStartTime: nextStartParts.localTime,
          localEndTime: nextEndParts.localTime,
          metadataJson: selectedOccurrence.metadataJson,
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
            configJson: {
              specificDates: ruleDraft.specificDates
            }
          },
          copyForwardInvites: true,
          copyForwardFacilities: true
        });

        if (!recurringResult.ok) {
          toast({
            title: "Unable to update recurring event",
            description: recurringResult.error,
            variant: "destructive"
          });
          refreshWorkspace();
          return;
        }

        refreshWorkspace("Recurring event updated");
      });
      return;
    }

    setReadModel((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === selectedEntry.id
          ? { ...entry, title: nextTitle, settingsJson: { ...entry.settingsJson, location: editLocationDraft.trim() || null }, updatedAt: now }
          : entry
      ),
      occurrences: current.occurrences.map((occurrence) =>
        occurrence.id === selectedOccurrence.id
          ? {
              ...occurrence,
              startsAtUtc: nextStartsAtUtc,
              endsAtUtc: nextEndsAtUtc,
              localDate: nextStartParts.localDate,
              localStartTime: nextStartParts.localTime,
              localEndTime: nextEndParts.localTime,
              updatedAt: now
            }
          : occurrence
      ),
      allocations: current.allocations.map((allocation) =>
        allocation.occurrenceId === selectedOccurrence.id ? { ...allocation, startsAtUtc: nextStartsAtUtc, endsAtUtc: nextEndsAtUtc, updatedAt: now } : allocation
      )
    }));

    startSaving(async () => {
      const entryUpdate = await updateCalendarEntryAction({
        orgSlug,
        entryId: selectedEntry.id,
        sourceId: selectedEntry.sourceId,
        purpose: selectedEntry.purpose,
        audience: selectedEntry.audience,
        entryType: selectedEntry.entryType,
        title: nextTitle,
        summary: selectedEntry.summary ?? "",
        visibility: selectedEntry.visibility,
        status: selectedEntry.status,
        hostTeamId: selectedEntry.hostTeamId,
        timezone: selectedEntry.defaultTimezone,
        location: editLocationDraft.trim()
      });

      if (!entryUpdate.ok) {
        toast({
          title: "Unable to update event",
          description: entryUpdate.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      const occurrenceUpdate = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: selectedOccurrence.id,
        entryId: selectedOccurrence.entryId,
        timezone: selectedOccurrence.timezone,
        localDate: nextStartParts.localDate,
        localStartTime: nextStartParts.localTime,
        localEndTime: nextEndParts.localTime,
        metadataJson: selectedOccurrence.metadataJson
      });

      if (!occurrenceUpdate.ok) {
        toast({
          title: "Unable to update timing",
          description: occurrenceUpdate.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      refreshWorkspace("Event updated");
    });
  }

  function openEditFacilityDialog() {
    if (!selectedOccurrence) {
      return;
    }

    const selections: FacilityBookingSelection[] = selectedAllocations.map((allocation) => ({
      spaceId: allocation.spaceId,
      configurationId: allocation.configurationId,
      lockMode: allocation.lockMode,
      allowShared: allocation.allowShared,
      notes: typeof allocation.metadataJson?.notes === "string" ? (allocation.metadataJson.notes as string) : ""
    }));

    const firstSpaceId = selections[0]?.spaceId;
    const rootId = firstSpaceId ? resolveRootSpaceId(firstSpaceId, spaceById) ?? "" : "";
    setSelectedFacilityId(rootId);
    setFacilitySelections(selections);
    setBookingMode("edit-occurrence");
    setFacilityDialogOpen(true);
  }

  const activeRule = useMemo(
    () => (selectedOccurrence?.sourceRuleId ? readModel.rules.find((rule) => rule.id === selectedOccurrence.sourceRuleId) ?? null : null),
    [readModel.rules, selectedOccurrence?.sourceRuleId]
  );

  useEffect(() => {
    if (!selectedOccurrence || !activeRule) {
      setEditScope("series");
      return;
    }
    setRuleDraft(scheduleDraftFromCalendarRule(activeRule));
  }, [activeRule, selectedOccurrence?.id]);

  const bookingWindows = useMemo<FacilityBookingWindow[]>(() => {
    if (bookingMode === "quick-add") {
      if (!quickAddDraft) {
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
    }

    if (bookingMode === "edit-occurrence" && selectedOccurrence) {
      if (activeRule) {
        return generateOccurrencesForRule(activeRule, { horizonMonths: 3 }).map((occurrence) => ({
          occurrenceId: occurrence.sourceKey,
          startsAtUtc: occurrence.startsAtUtc,
          endsAtUtc: occurrence.endsAtUtc,
          label: occurrence.localDate
        }));
      }

      return [
        {
          occurrenceId: selectedOccurrence.id,
          startsAtUtc: selectedOccurrence.startsAtUtc,
          endsAtUtc: selectedOccurrence.endsAtUtc,
          label: selectedOccurrence.localDate
        }
      ];
    }

    return [];
  }, [activeRule, bookingMode, quickAddDraft, ruleDraft, selectedOccurrence]);

  const quickAddFacilityConflicts = useMemo(() => {
    if (!quickAddDraft?.open || facilitySelections.length === 0) {
      return null;
    }
    return computeFacilityConflicts({
      readModel,
      facilityReadModel,
      selections: facilitySelections,
      windows: [
        {
          occurrenceId: "draft",
          startsAtUtc: quickAddDraft.startsAtUtc,
          endsAtUtc: quickAddDraft.endsAtUtc,
          label: "Draft"
        }
      ],
      spaceById
    });
  }, [facilityReadModel, facilitySelections, quickAddDraft, readModel, spaceById]);

  async function handleBookingSave() {
    if (bookingMode === "quick-add") {
      setFacilityDialogOpen(false);
      return;
    }

    if (!selectedOccurrence || !selectedEntry) {
      setFacilityDialogOpen(false);
      return;
    }

    const facility = selectedFacilityId ? spaceById.get(selectedFacilityId) ?? null : null;
    const locationValue = facility ? formatFacilityLocation(facility, selectedFacilitySpaces) || facility.name : "";

    setReadModel((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === selectedEntry.id ? { ...entry, settingsJson: { ...entry.settingsJson, location: locationValue } } : entry
      )
    }));

    if (activeRule) {
      startSaving(async () => {
        const allocationResult = await setRuleFacilityAllocationsAction({
          orgSlug,
          ruleId: activeRule.id,
          allocations: facilitySelections
        });

        if (!allocationResult.ok) {
          toast({
            title: "Unable to update facility booking",
            description: allocationResult.error,
            variant: "destructive"
          });
          refreshWorkspace();
          return;
        }

        if (allocationResult.data.conflicts.length > 0) {
          toast({
            title: "Some occurrences have facility conflicts",
            description: "Conflicting spaces were skipped for those occurrences.",
            variant: "info"
          });
        }

        const entryUpdate = await updateCalendarEntryAction({
          orgSlug,
          entryId: selectedEntry.id,
          sourceId: selectedEntry.sourceId,
          purpose: selectedEntry.purpose,
          audience: selectedEntry.audience,
          entryType: selectedEntry.entryType,
          title: selectedEntry.title,
          summary: selectedEntry.summary ?? "",
          visibility: selectedEntry.visibility,
          status: selectedEntry.status,
          hostTeamId: selectedEntry.hostTeamId,
          timezone: selectedEntry.defaultTimezone,
          location: locationValue
        });

        if (!entryUpdate.ok) {
          toast({
            title: "Unable to update location",
            description: entryUpdate.error,
            variant: "destructive"
          });
        }

        refreshWorkspace("Facility booking updated");
      });
    } else {
      setReadModel((current) => {
        const nextAllocations = facilitySelections.map((selection) => ({
          id: buildOptimisticId("optimistic-allocation"),
          orgId: resolveOrgId(current),
          occurrenceId: selectedOccurrence.id,
          spaceId: selection.spaceId,
          configurationId: selection.configurationId ?? "optimistic-config",
          lockMode: selection.lockMode ?? "exclusive",
          allowShared: selection.allowShared ?? false,
          startsAtUtc: selectedOccurrence.startsAtUtc,
          endsAtUtc: selectedOccurrence.endsAtUtc,
          isActive: true,
          metadataJson: selection.notes ? { notes: selection.notes } : {},
          createdBy: null,
          updatedBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        return {
          ...current,
          allocations: [...current.allocations.filter((allocation) => allocation.occurrenceId !== selectedOccurrence.id), ...nextAllocations]
        };
      });

      startSaving(async () => {
        const allocationResult = await setOccurrenceFacilityAllocationsAction({
          orgSlug,
          occurrenceId: selectedOccurrence.id,
          allocations: facilitySelections
        });

        if (!allocationResult.ok) {
          toast({
            title: "Unable to update facility booking",
            description: allocationResult.error,
            variant: "destructive"
          });
          refreshWorkspace();
          return;
        }

        const entryUpdate = await updateCalendarEntryAction({
          orgSlug,
          entryId: selectedEntry.id,
          sourceId: selectedEntry.sourceId,
          purpose: selectedEntry.purpose,
          audience: selectedEntry.audience,
          entryType: selectedEntry.entryType,
          title: selectedEntry.title,
          summary: selectedEntry.summary ?? "",
          visibility: selectedEntry.visibility,
          status: selectedEntry.status,
          hostTeamId: selectedEntry.hostTeamId,
          timezone: selectedEntry.defaultTimezone,
          location: locationValue
        });

        if (!entryUpdate.ok) {
          toast({
            title: "Unable to update location",
            description: entryUpdate.error,
            variant: "destructive"
          });
        }

        refreshWorkspace("Facility booking updated");
      });
    }

    setFacilityDialogOpen(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <UnifiedCalendar
        canEdit={canWrite}
        disableHoverGhost={Boolean(selectedOccurrenceId) || Boolean(quickAddDraft?.open) || facilityDialogOpen}
        className="min-h-0 flex-1"
        quickAddUx="external"
        referenceTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        controlsSlot={
          <CalendarSourceFilterPopover onChange={setSelectedSourceIds} selectedSourceIds={selectedSourceIds} sources={scopedReadModel.sources} />
        }
        getConflictMessage={(draft) => {
          const hasOverlap = items.some((item) => {
            const start = new Date(item.startsAtUtc).getTime();
            const end = new Date(item.endsAtUtc).getTime();
            const newStart = new Date(draft.startsAtUtc).getTime();
            const newEnd = new Date(draft.endsAtUtc).getTime();
            return newStart < end && newEnd > start;
          });
          if (hasOverlap) {
            return "This time overlaps an existing item.";
          }
          if (!ruleDraft.repeatEnabled && quickAddFacilityConflicts?.hasBlockingConflicts) {
            return "Selected facility spaces are already booked.";
          }
          return null;
        }}
        items={items}
        onCreateRange={(range) =>
          openCreateComposer({
            title: "Team practice",
            startsAtUtc: range.startsAtUtc,
            endsAtUtc: range.endsAtUtc
          })
        }
        onQuickAddIntent={openCreateComposer}
        onSelectItem={(occurrenceId) => {
          setQuickAddDraft(null);
          setSelectedOccurrenceId(occurrenceId);
        }}
      />
      <FacilityBookingDialog
        allowPartialConflicts={bookingMode === "quick-add" ? ruleDraft.repeatEnabled : Boolean(activeRule)}
        calendarReadModel={readModel}
        configurations={readModel.configurations}
        facilityId={selectedFacilityId || null}
        facilityReadModel={facilityReadModel}
        onClose={() => setFacilityDialogOpen(false)}
        onSave={handleBookingSave}
        onSelectionsChange={setFacilitySelections}
        occurrenceWindows={bookingWindows}
        open={facilityDialogOpen}
        saveLabel={bookingMode === "edit-occurrence" ? "Update booking" : "Apply booking"}
        selections={facilitySelections}
        spaces={facilityReadModel.spaces}
        ignoreOccurrenceId={bookingMode === "edit-occurrence" ? selectedOccurrence?.id ?? null : null}
      />
      <Panel
        footer={
          createMode ? (
            <>
              <Button onClick={closeComposer} type="button" variant="ghost">
                Cancel
              </Button>
              {createScreen !== "basics" ? (
                <Button
                  onClick={() => setCreateScreen(createScreens[Math.max(0, createScreenIndex - 1)]?.key ?? "basics")}
                  type="button"
                  variant="ghost"
                >
                  Back
                </Button>
              ) : null}
              {createScreen !== "schedule" ? (
                <Button
                  onClick={() => setCreateScreen(createScreens[Math.min(createScreens.length - 1, createScreenIndex + 1)]?.key ?? "schedule")}
                  type="button"
                >
                  Next
                </Button>
              ) : (
                <Button disabled={!canWrite || !quickAddDraft?.title?.trim()} onClick={submitCreateComposer} type="button">
                  Create event
                </Button>
              )}
            </>
          ) : editMode ? (
            <>
              <Button onClick={closeComposer} type="button" variant="ghost">
                Close
              </Button>
              <Button
                disabled={!canWrite || selectedInvite?.role !== "host" || !editTitle.trim()}
                onClick={submitEditComposer}
                type="button"
              >
                Save changes
              </Button>
            </>
          ) : undefined
        }
        onClose={closeComposer}
        open={composerOpen}
        subtitle={composerSubtitle}
        title={composerTitle}
      >
        {createMode && quickAddDraft ? (
          <ScrollableSheetBody className="space-y-4 pr-1">
            <PanelScreens activeKey={createScreen} onChange={(key) => setCreateScreen(key as typeof createScreen)} screens={createScreens as unknown as { key: string; label: string }[]} />

            {createScreen === "basics" ? (
              <label className="space-y-1 text-xs text-text-muted">
                <span>Title</span>
                <Input
                  onChange={(event) => setQuickAddDraft((current) => (current ? { ...current, title: event.target.value, open: true } : current))}
                  placeholder="Event title"
                  value={quickAddDraft.title}
                />
              </label>
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
                      ...facilityOptions.map((space) => ({
                        label: space.name,
                        value: space.id,
                        statusDot: resolveFacilityStatusDot(space.status),
                        meta: space.status
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
                  <div className="space-y-2 rounded-control border p-3">
                    {facilitySelections.length === 0 ? (
                      <Button
                        onClick={() => {
                          setBookingMode("quick-add");
                          setFacilityDialogOpen(true);
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Book Spaces
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Selected spaces</p>
                        <div className="flex flex-wrap gap-2">
                          {facilitySelections.map((selection) => (
                            <span className="rounded-full border bg-surface px-2 py-1 text-xs" key={selection.spaceId}>
                              {spaceById.get(selection.spaceId)?.name ?? selection.spaceId}
                            </span>
                          ))}
                        </div>
                        <Button
                          onClick={() => {
                            setBookingMode("quick-add");
                            setFacilityDialogOpen(true);
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Edit spaces
                        </Button>
                      </div>
                    )}
                    {selectedFacilityAddress ? <p className="text-xs text-text-muted">{selectedFacilityAddress}</p> : null}
                    {selectedFacility.status === "closed" ? <p className="text-xs text-destructive">This facility is currently marked closed.</p> : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {createScreen === "schedule" ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Starts</span>
                    <CalendarPicker
                      includeTime
                      onChange={(nextValue) => {
                        const next = localInputToUtcIso(nextValue);
                        if (!next) {
                          return;
                        }
                        setQuickAddDraft((current) => (current ? { ...current, startsAtUtc: next, open: true } : current));
                      }}
                      value={toLocalInputValue(quickAddDraft.startsAtUtc)}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Ends</span>
                    <CalendarPicker
                      includeTime
                      onChange={(nextValue) => {
                        const next = localInputToUtcIso(nextValue);
                        if (!next) {
                          return;
                        }
                        setQuickAddDraft((current) => (current ? { ...current, endsAtUtc: next, open: true } : current));
                      }}
                      value={toLocalInputValue(quickAddDraft.endsAtUtc)}
                    />
                  </label>
                </div>

                <RecurringEventEditor canWrite={canWrite} draft={ruleDraft} onChange={setRuleDraft} />
              </>
            ) : null}
          </ScrollableSheetBody>
        ) : null}

        {selectedOccurrence && selectedEntry ? (
            <ScrollableSheetBody className="space-y-3 pr-1">
              <label className="space-y-1 text-xs text-text-muted">
                <span>Title</span>
                <Input disabled={selectedInvite?.role !== "host"} onChange={(event) => setEditTitle(event.target.value)} value={editTitle} />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-text-muted">
                  <span>Starts</span>
                  <CalendarPicker includeTime onChange={setEditStartsAtLocal} value={editStartsAtLocal} />
                </label>
                <label className="space-y-1 text-xs text-text-muted">
                  <span>Ends</span>
                  <CalendarPicker includeTime onChange={setEditEndsAtLocal} value={editEndsAtLocal} />
                </label>
              </div>
              <p className="text-sm text-text-muted">
                {new Date(selectedOccurrence.startsAtUtc).toLocaleString()} - {new Date(selectedOccurrence.endsAtUtc).toLocaleString()}
              </p>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Location</p>
                <UniversalAddressField
                  disabled={selectedInvite?.role !== "host"}
                  onChange={setEditLocationDraft}
                  value={editLocationDraft}
                />
              </div>

              {selectedOccurrence.sourceRuleId ? (
                <div className="space-y-2 rounded-control border p-3">
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Apply changes to</span>
                    <Select
                      disabled={selectedInvite?.role !== "host"}
                      onChange={(event) => setEditScope(event.target.value as typeof editScope)}
                      options={[
                        { label: "This occurrence only", value: "occurrence" },
                        { label: "This and following", value: "following" },
                        { label: "Entire series", value: "series" }
                      ]}
                      value={editScope}
                    />
                  </label>
                  <RecurringEventEditor canWrite={canWrite && selectedInvite?.role === "host"} draft={ruleDraft} onChange={setRuleDraft} />
                </div>
              ) : null}

              <div className="space-y-2 rounded-control border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Facility booking</p>
                {selectedAllocations.length === 0 ? <p className="text-sm text-text-muted">No facility spaces assigned.</p> : null}
                <div className="flex flex-wrap gap-2">
                  {selectedAllocations.map((allocation) => (
                    <span className="rounded-full border bg-surface px-2 py-1 text-xs" key={allocation.id}>
                      {spaceById.get(allocation.spaceId)?.name ?? allocation.spaceId}
                    </span>
                  ))}
                </div>
                <Button disabled={!canWrite} onClick={openEditFacilityDialog} size="sm" type="button" variant="secondary">
                  {selectedAllocations.length > 0 ? "Edit facility booking" : "Add facility booking"}
                </Button>
              </div>

              {selectedInvite?.role === "participant" && selectedInvite.inviteStatus === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      upsertInviteOptimistically({
                        occurrenceId: selectedOccurrence.id,
                        teamId,
                        role: "participant",
                        inviteStatus: "accepted"
                      });
                      startSaving(async () => {
                        const result = await respondToTeamInviteAction({
                          orgSlug,
                          occurrenceId: selectedOccurrence.id,
                          teamId,
                          response: "accepted"
                        });

                        if (!result.ok) {
                          toast({
                            title: "Unable to accept invite",
                            description: result.error,
                            variant: "destructive"
                          });
                          refreshWorkspace();
                          return;
                        }

                        refreshWorkspace("Invite accepted");
                      });
                    }}
                    size="sm"
                    type="button"
                  >
                    Accept
                  </Button>
                  <Button
                    onClick={() => {
                      upsertInviteOptimistically({
                        occurrenceId: selectedOccurrence.id,
                        teamId,
                        role: "participant",
                        inviteStatus: "declined"
                      });
                      startSaving(async () => {
                        const result = await respondToTeamInviteAction({
                          orgSlug,
                          occurrenceId: selectedOccurrence.id,
                          teamId,
                          response: "declined"
                        });

                        if (!result.ok) {
                          toast({
                            title: "Unable to decline invite",
                            description: result.error,
                            variant: "destructive"
                          });
                          refreshWorkspace();
                          return;
                        }

                        refreshWorkspace("Invite declined");
                      });
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Decline
                  </Button>
                </div>
              ) : null}

              {selectedInvite?.role === "participant" && selectedInvite.inviteStatus === "accepted" ? (
                <Button
                  onClick={() => {
                    upsertInviteOptimistically({
                      occurrenceId: selectedOccurrence.id,
                      teamId,
                      role: "participant",
                      inviteStatus: "left"
                    });
                    startSaving(async () => {
                      const result = await leaveSharedOccurrenceAction({
                        orgSlug,
                        occurrenceId: selectedOccurrence.id,
                        teamId
                      });

                      if (!result.ok) {
                        toast({
                          title: "Unable to leave occurrence",
                          description: result.error,
                          variant: "destructive"
                        });
                        refreshWorkspace();
                        return;
                      }

                      refreshWorkspace("Left shared occurrence");
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Leave session
                </Button>
              ) : null}

              {selectedInvite?.role === "host" ? (
                <Button
                  onClick={() => {
                    if (selectedOccurrence.sourceRuleId) {
                      setPendingRecurringMutation({
                        type: "delete",
                        occurrenceId: selectedOccurrence.id
                      });
                      setPendingRecurringScope("occurrence");
                      return;
                    }
                    setReadModel((current) => ({
                      ...current,
                      occurrences: current.occurrences.filter((occurrence) => occurrence.id !== selectedOccurrence.id),
                      invites: current.invites.filter((invite) => invite.occurrenceId !== selectedOccurrence.id),
                      allocations: current.allocations.filter((allocation) => allocation.occurrenceId !== selectedOccurrence.id)
                    }));
                    setSelectedOccurrenceId((current) => (current === selectedOccurrence.id ? null : current));
                    startSaving(async () => {
                      const result = await deleteOccurrenceAction({
                        orgSlug,
                        occurrenceId: selectedOccurrence.id
                      });

                      if (!result.ok) {
                        toast({
                          title: "Unable to delete host occurrence",
                          description: result.error,
                          variant: "destructive"
                        });
                        refreshWorkspace();
                        return;
                      }

                      refreshWorkspace("Occurrence deleted");
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Delete host occurrence
                </Button>
              ) : null}
            </ScrollableSheetBody>
          ) : null}
      </Panel>
      <Panel
        footer={
          <>
            <Button onClick={() => setPendingRecurringMutation(null)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!pendingRecurringMutation) {
                  return;
                }
                const mutation = pendingRecurringMutation;
                setPendingRecurringMutation(null);
                startSaving(async () => {
                  const result = await deleteRecurringOccurrenceAction({
                    orgSlug,
                    occurrenceId: mutation.occurrenceId,
                    deleteScope: pendingRecurringScope
                  });
                  if (!result.ok) {
                    toast({
                      title: "Unable to delete recurring occurrence",
                      description: result.error,
                      variant: "destructive"
                    });
                    refreshWorkspace();
                    return;
                  }
                  refreshWorkspace("Recurring occurrence deleted");
                });
              }}
              type="button"
            >
              Apply
            </Button>
          </>
        }
        onClose={() => setPendingRecurringMutation(null)}
        open={Boolean(pendingRecurringMutation)}
        subtitle="Choose how far this recurring delete should apply."
        title="Delete Recurring Occurrence"
      >
        <div className="space-y-3">
          <label className="space-y-1 text-xs text-text-muted">
            <span>Scope</span>
            <Select
              onChange={(event) => setPendingRecurringScope(event.target.value as typeof pendingRecurringScope)}
              options={[
                { label: "This occurrence only", value: "occurrence" },
                { label: "This and following", value: "following" },
                { label: "Entire series", value: "series" }
              ]}
              value={pendingRecurringScope}
            />
          </label>
        </div>
      </Panel>
    </div>
  );
}
