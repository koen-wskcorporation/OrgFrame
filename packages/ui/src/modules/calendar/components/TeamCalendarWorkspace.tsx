"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Input } from "@orgframe/ui/ui/input";
import { Panel } from "@orgframe/ui/ui/panel";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  leaveSharedOccurrenceAction,
  respondToTeamInviteAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  setOccurrenceStatusAction,
  updateCalendarEntryAction,
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
import { RuleBuilderPanel } from "@orgframe/ui/modules/programs/schedule/components/RuleBuilderPanel";
import type { ScheduleRuleDraft } from "@orgframe/ui/modules/programs/schedule/components/types";
import { generateOccurrencesForRule } from "@/modules/calendar/rule-engine";
import {
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@orgframe/ui/modules/calendar/components/workspace-utils";
import { FacilityBookingDialog } from "@orgframe/ui/modules/calendar/components/FacilityBookingDialog";
import {
  buildSpaceById,
  computeFacilityConflicts,
  formatFacilityLocation,
  resolveRootSpaceId,
  type FacilityBookingSelection,
  type FacilityBookingWindow
} from "@orgframe/ui/modules/calendar/components/facility-booking-utils";

function buildRuleDraftFromWindow(startsAtUtc: string, endsAtUtc: string, timezone: string): ScheduleRuleDraft {
  const startParts = toLocalParts(startsAtUtc, timezone);
  const endParts = toLocalParts(endsAtUtc, timezone);
  const startDate = startParts.localDate;

  return {
    mode: "single_date",
    repeatEnabled: false,
    title: "",
    timezone,
    startDate,
    endDate: startDate,
    startTime: startParts.localTime,
    endTime: endParts.localTime,
    intervalCount: 1,
    intervalUnit: "week",
    byWeekday: [new Date(startsAtUtc).getDay()],
    byMonthday: [],
    endMode: "until_date",
    untilDate: "",
    maxOccurrences: "",
    programNodeId: "",
    specificDates: [startDate]
  };
}

function buildCalendarRuleInputFromDraft(input: { draft: ScheduleRuleDraft; entryId: string }) {
  const mode = input.draft.repeatEnabled ? "repeating_pattern" : input.draft.mode;
  return {
    entryId: input.entryId,
    mode,
    timezone: input.draft.timezone,
    startDate: input.draft.startDate,
    endDate: input.draft.endDate,
    startTime: input.draft.startTime,
    endTime: input.draft.endTime,
    intervalCount: input.draft.intervalCount,
    intervalUnit: input.draft.intervalUnit,
    byWeekday: input.draft.byWeekday,
    byMonthday: input.draft.byMonthday,
    endMode: input.draft.endMode,
    untilDate: input.draft.untilDate,
    maxOccurrences: input.draft.maxOccurrences ? Number.parseInt(input.draft.maxOccurrences, 10) : null,
    configJson: {
      specificDates: input.draft.specificDates
    }
  };
}

function buildOccurrenceWindowsFromRuleDraft(input: { draft: ScheduleRuleDraft; entryId: string }): FacilityBookingWindow[] {
  const rule = {
    id: "draft",
    orgId: "draft",
    entryId: input.entryId,
    mode: input.draft.repeatEnabled ? "repeating_pattern" : input.draft.mode,
    timezone: input.draft.timezone,
    startDate: input.draft.startDate || null,
    endDate: input.draft.endDate || null,
    startTime: input.draft.startTime || null,
    endTime: input.draft.endTime || null,
    intervalCount: input.draft.intervalCount,
    intervalUnit: input.draft.intervalUnit,
    byWeekday: input.draft.byWeekday,
    byMonthday: input.draft.byMonthday,
    endMode: input.draft.endMode,
    untilDate: input.draft.untilDate || null,
    maxOccurrences: input.draft.maxOccurrences ? Number.parseInt(input.draft.maxOccurrences, 10) : null,
    sortIndex: 0,
    isActive: true,
    configJson: {
      specificDates: input.draft.specificDates
    },
    ruleHash: "",
    createdBy: null,
    updatedBy: null,
    createdAt: "",
    updatedAt: ""
  } as const;

  return generateOccurrencesForRule(rule, { horizonMonths: 3 }).map((occurrence) => ({
    occurrenceId: occurrence.sourceKey,
    startsAtUtc: occurrence.startsAtUtc,
    endsAtUtc: occurrence.endsAtUtc,
    label: occurrence.localDate
  }));
}

function resolveEntryLocation(entry: CalendarEntry | null) {
  if (!entry) {
    return "";
  }
  const location = entry.settingsJson?.location;
  return typeof location === "string" ? location : "";
}

type TeamCalendarWorkspaceProps = {
  orgSlug: string;
  teamId: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
};

export function TeamCalendarWorkspace({ orgSlug, teamId, canWrite, initialReadModel, initialFacilityReadModel }: TeamCalendarWorkspaceProps) {
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
  const [quickAddDraft, setQuickAddDraft] = useState<(UnifiedCalendarQuickAddDraft & { open: boolean }) | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationTouched, setLocationTouched] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("");
  const [facilitySelections, setFacilitySelections] = useState<FacilityBookingSelection[]>([]);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState<"quick-add" | "edit-occurrence" | null>(null);
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

  const items = useMemo(() => toCalendarItems(scopedReadModel), [scopedReadModel]);

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

  useEffect(() => {
    if (!quickAddDraft?.open) {
      setLocationDraft("");
      setLocationTouched(false);
      setSelectedFacilityId("");
      setFacilitySelections([]);
      setBookingMode(null);
      return;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startValue = quickAddDraft.startsAtUtc;
    const endValue = quickAddDraft.endsAtUtc;

    setRuleDraft((current) => {
      if (!current.repeatEnabled) {
        return buildRuleDraftFromWindow(startValue, endValue, timezone);
      }

      const startParts = toLocalParts(startValue, timezone);
      const endParts = toLocalParts(endValue, timezone);
      return {
        ...current,
        timezone,
        startDate: startParts.localDate,
        startTime: startParts.localTime,
        endTime: endParts.localTime
      };
    });
  }, [quickAddDraft?.endsAtUtc, quickAddDraft?.open, quickAddDraft?.startsAtUtc]);

  useEffect(() => {
    if (locationTouched) {
      return;
    }
    if (selectedFacility) {
      const label = formatFacilityLocation(selectedFacility, selectedFacilitySpaces);
      setLocationDraft(label || selectedFacility.name);
      return;
    }
    setLocationDraft("");
  }, [locationTouched, selectedFacility, selectedFacilitySpaces]);

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

  function resolveOrgId(model: CalendarReadModel) {
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.invites[0]?.orgId ?? "";
  }

  const eventPanelOpen = Boolean(selectedOccurrence && selectedEntry);
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry ? `${selectedEntry.entryType} · ${selectedInvite?.inviteStatus ?? "not-invited"}` : "Select a calendar item to manage invites.";

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
      entryType: "practice",
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

  function openQuickAddFacilityDialog(nextFacilityId: string) {
    if (!nextFacilityId) {
      setSelectedFacilityId("");
      setFacilitySelections([]);
      return;
    }
    setSelectedFacilityId(nextFacilityId);
    setLocationTouched(false);
    setBookingMode("quick-add");
    setFacilityDialogOpen(true);
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
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Team Calendar</CardTitle>
        <CardDescription>Manage team-hosted practices and invited shared sessions.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <UnifiedCalendar
          canEdit={canWrite}
          disableHoverGhost={Boolean(selectedOccurrenceId) || facilityDialogOpen}
          className="min-h-0 flex-1"
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
          onQuickAddDraftChange={setQuickAddDraft}
          onCreateRange={(range) =>
            quickAddTeamPractice({
              title: "Team practice",
              startsAtUtc: range.startsAtUtc,
              endsAtUtc: range.endsAtUtc
            })
          }
          onQuickAdd={quickAddTeamPractice}
          onSelectItem={setSelectedOccurrenceId}
          renderQuickAddFields={() => (
            <div className="space-y-3">
              <label className="space-y-1 text-xs text-text-muted">
                <span>Location</span>
                <Input
                  onChange={(event) => {
                    setLocationTouched(true);
                    setLocationDraft(event.target.value);
                  }}
                  placeholder="Optional location"
                  value={locationDraft}
                />
              </label>
              <div className="grid gap-2">
                <label className="space-y-1 text-xs text-text-muted">
                  <span>Facility</span>
                  <Select
                    disabled={!canWrite || facilityOptions.length === 0}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!next) {
                        setSelectedFacilityId("");
                        setFacilitySelections([]);
                        setLocationTouched(false);
                        return;
                      }
                      openQuickAddFacilityDialog(next);
                    }}
                    options={[
                      { label: "No facility (free-text location)", value: "" },
                      ...facilityOptions.map((space) => ({ label: space.name, value: space.id }))
                    ]}
                    value={selectedFacilityId}
                  />
                </label>
                {selectedFacilityId ? (
                  <Button
                    onClick={() => {
                      setBookingMode("quick-add");
                      setFacilityDialogOpen(true);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {facilitySelections.length > 0 ? "Edit facility booking" : "Select facility spaces"}
                  </Button>
                ) : null}
              </div>
              <RuleBuilderPanel
                canWrite={canWrite}
                draft={ruleDraft}
                isSaving={false}
                nodes={[]}
                onChange={setRuleDraft}
                onSave={() => {}}
                showSaveButton={false}
              />
            </div>
          )}
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
          onClose={() => setSelectedOccurrenceId(null)}
          open={eventPanelOpen}
          subtitle={eventPanelSubtitle}
          title={selectedEntry?.title ?? "Event details"}
        >
          {selectedOccurrence && selectedEntry ? (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                {new Date(selectedOccurrence.startsAtUtc).toLocaleString()} - {new Date(selectedOccurrence.endsAtUtc).toLocaleString()}
              </p>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Location</p>
                <p className="text-sm text-text">{selectedLocation || "No location set."}</p>
              </div>

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
                {selectedOccurrence.sourceRuleId ? <p className="text-xs text-text-muted">Changes apply to the whole series.</p> : null}
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
                    setReadModel((current) => ({
                      ...current,
                      occurrences: current.occurrences.map((occurrence) =>
                        occurrence.id === selectedOccurrence.id ? { ...occurrence, status: "cancelled", updatedAt: new Date().toISOString() } : occurrence
                      )
                    }));
                    startSaving(async () => {
                      const result = await setOccurrenceStatusAction({
                        orgSlug,
                        occurrenceId: selectedOccurrence.id,
                        status: "cancelled"
                      });

                      if (!result.ok) {
                        toast({
                          title: "Unable to cancel host occurrence",
                          description: result.error,
                          variant: "destructive"
                        });
                        refreshWorkspace();
                        return;
                      }

                      refreshWorkspace("Occurrence cancelled");
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel host occurrence
                </Button>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </CardContent>
    </Card>
  );
}
