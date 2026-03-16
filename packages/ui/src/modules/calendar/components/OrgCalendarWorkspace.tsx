"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Input } from "@orgframe/ui/ui/input";
import { Panel } from "@orgframe/ui/ui/panel";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  setOccurrenceStatusAction,
  updateCalendarEntryAction,
  upsertCalendarRuleAction,
  updateOccurrenceAction
} from "@/modules/calendar/actions";
import type {
  CalendarEntry,
  CalendarEntryType,
  CalendarOccurrence,
  CalendarReadModel,
  CalendarVisibility,
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

type OrgCalendarWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

export function OrgCalendarWorkspace({ orgSlug, canWrite, initialReadModel, initialFacilityReadModel, activeTeams }: OrgCalendarWorkspaceProps) {
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
  const [entryTypeFilter, setEntryTypeFilter] = useState<"all" | CalendarEntryType>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | CalendarVisibility>("all");
  const [quickEntryType, setQuickEntryType] = useState<CalendarEntryType>("event");
  const [quickHostTeamId, setQuickHostTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [inviteTeamId, setInviteTeamId] = useState<string>(activeTeams[0]?.id ?? "");
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
  const pendingOccurrenceUpdatesRef = useRef(new Map<string, { startsAtUtc: string; endsAtUtc: string; timezone: string }>());
  const [, startSaving] = useTransition();

  const selectedOccurrence = useMemo(() => (selectedOccurrenceId ? findOccurrence(readModel, selectedOccurrenceId) : null), [readModel, selectedOccurrenceId]);
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(readModel, selectedOccurrence) : null),
    [readModel, selectedOccurrence]
  );
  const selectedInvites = useMemo(
    () => (selectedOccurrence ? readModel.invites.filter((item) => item.occurrenceId === selectedOccurrence.id) : []),
    [readModel.invites, selectedOccurrence]
  );
  const selectedAllocations = useMemo(
    () => (selectedOccurrence ? readModel.allocations.filter((allocation) => allocation.occurrenceId === selectedOccurrence.id) : []),
    [readModel.allocations, selectedOccurrence]
  );
  const selectedLocation = useMemo(() => resolveEntryLocation(selectedEntry), [selectedEntry]);

  const calendarItems = useMemo(
    () =>
      toCalendarItems(readModel, {
        visibility: visibilityFilter === "all" ? undefined : visibilityFilter,
        entryTypes: entryTypeFilter === "all" ? undefined : [entryTypeFilter]
      }),
    [entryTypeFilter, readModel, visibilityFilter]
  );

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

  function resolveOrgId(model: CalendarReadModel) {
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.invites[0]?.orgId ?? "";
  }

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function isOptimisticId(value: string) {
    return value.startsWith("optimistic-");
  }

  function removeOptimistic(optimisticEntryId: string, optimisticOccurrenceId: string) {
    pendingOccurrenceUpdatesRef.current.delete(optimisticOccurrenceId);
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
    invitedAt?: string | null;
    respondedAt?: string | null;
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
                  invitedAt: input.invitedAt ?? invite.invitedAt,
                  respondedAt: input.respondedAt ?? invite.respondedAt,
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
        invitedAt: input.invitedAt ?? now,
        respondedByUserId: null,
        respondedAt: input.respondedAt ?? null,
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
          title: "Unable to refresh calendar",
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

  function createFromDraft(draft: UnifiedCalendarQuickAddDraft) {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const isRecurring = ruleDraft.repeatEnabled;
    const locationValue = locationDraft.trim();
    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      entryType: quickEntryType,
      title: draft.title,
      summary: "",
      visibility: quickEntryType === "practice" ? "internal" : "published",
      status: "scheduled",
      hostTeamId: quickEntryType === "practice" ? quickHostTeamId || null : null,
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
        createdVia: "quick_add",
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
    setSelectedOccurrenceId(optimisticOccurrenceId);

    startSaving(async () => {
      const entryResult = await createCalendarEntryAction({
        orgSlug,
        entryType: quickEntryType,
        title: draft.title,
        summary: "",
        visibility: quickEntryType === "practice" ? "internal" : "published",
        status: "scheduled",
        hostTeamId: quickEntryType === "practice" ? quickHostTeamId || null : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
        metadataJson: {
          createdVia: "quick_add"
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

      refreshWorkspace("Calendar item created");
    });
  }

  function moveOccurrence(itemId: string, startsAtUtc: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) {
      return;
    }

    const startParts = toLocalParts(startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
    const now = new Date().toISOString();

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((item) =>
        item.id === occurrence.id
          ? {
              ...item,
              startsAtUtc,
              endsAtUtc,
              localDate: startParts.localDate,
              localStartTime: startParts.localTime,
              localEndTime: endParts.localTime,
              updatedAt: now
            }
          : item
      ),
      allocations: current.allocations.map((allocation) =>
        allocation.occurrenceId === occurrence.id
          ? {
              ...allocation,
              startsAtUtc,
              endsAtUtc,
              updatedAt: now
            }
          : allocation
      )
    }));

    if (isOptimisticId(occurrence.id)) {
      pendingOccurrenceUpdatesRef.current.set(occurrence.id, { startsAtUtc, endsAtUtc, timezone: occurrence.timezone });
      return;
    }

    startSaving(async () => {
      const result = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: occurrence.id,
        entryId: occurrence.entryId,
        timezone: occurrence.timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: {
          ...occurrence.metadataJson,
          movedAt: new Date().toISOString()
        }
      });

      if (!result.ok) {
        toast({
          title: "Unable to move occurrence",
          description: result.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      refreshWorkspace("Occurrence moved");
    });
  }

  function resizeOccurrence(itemId: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) {
      return;
    }

    const startParts = toLocalParts(occurrence.startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
    const now = new Date().toISOString();

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((item) =>
        item.id === occurrence.id
          ? {
              ...item,
              endsAtUtc,
              localDate: startParts.localDate,
              localStartTime: startParts.localTime,
              localEndTime: endParts.localTime,
              updatedAt: now
            }
          : item
      ),
      allocations: current.allocations.map((allocation) =>
        allocation.occurrenceId === occurrence.id
          ? {
              ...allocation,
              endsAtUtc,
              updatedAt: now
            }
          : allocation
      )
    }));

    if (isOptimisticId(occurrence.id)) {
      pendingOccurrenceUpdatesRef.current.set(occurrence.id, { startsAtUtc: occurrence.startsAtUtc, endsAtUtc, timezone: occurrence.timezone });
      return;
    }

    startSaving(async () => {
      const result = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: occurrence.id,
        entryId: occurrence.entryId,
        timezone: occurrence.timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: {
          ...occurrence.metadataJson,
          resizedAt: new Date().toISOString()
        }
      });

      if (!result.ok) {
        toast({
          title: "Unable to resize occurrence",
          description: result.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      refreshWorkspace("Occurrence updated");
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

  const eventPanelOpen = Boolean(selectedOccurrence && selectedEntry);
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry ? `${selectedEntry.entryType} · ${selectedOccurrence.status}` : "Select a calendar item to manage invites and status.";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Calendar Workspace</CardTitle>
        <CardDescription>Unified events, practices, and games with drag-create, drag-move, and resize actions.</CardDescription>
      </CardHeader>
      <UnifiedCalendar
        canEdit={canWrite}
        disableHoverGhost={Boolean(selectedOccurrenceId) || facilityDialogOpen}
        framed={false}
        className="min-h-0 flex-1 px-5 pb-5 md:px-6 md:pb-6"
        filterSlot={
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              onChange={(event) => setEntryTypeFilter(event.target.value as "all" | CalendarEntryType)}
              options={[
                { label: "All types", value: "all" },
                { label: "Events", value: "event" },
                { label: "Practices", value: "practice" },
                { label: "Games", value: "game" }
              ]}
              value={entryTypeFilter}
            />
            <Select
              onChange={(event) => setVisibilityFilter(event.target.value as "all" | CalendarVisibility)}
              options={[
                { label: "All visibility", value: "all" },
                { label: "Internal", value: "internal" },
                { label: "Published", value: "published" }
              ]}
              value={visibilityFilter}
            />
            <Select
              disabled={!canWrite}
              onChange={(event) => setQuickEntryType(event.target.value as CalendarEntryType)}
              options={[
                { label: "Quick add type: Event", value: "event" },
                { label: "Quick add type: Practice", value: "practice" },
                { label: "Quick add type: Game", value: "game" }
              ]}
              value={quickEntryType}
            />
            <Select
              disabled={!canWrite || quickEntryType !== "practice"}
              onChange={(event) => setQuickHostTeamId(event.target.value)}
              options={
                activeTeams.length > 0
                  ? activeTeams.map((team) => ({ label: team.label, value: team.id }))
                  : [{ label: "No active teams", value: "" }]
              }
              value={quickHostTeamId}
            />
          </div>
        }
        getConflictMessage={(draft) => {
          const hasOverlap = calendarItems.some((item) => {
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
        items={calendarItems}
        onQuickAddDraftChange={setQuickAddDraft}
        onCreateRange={(range) =>
          createFromDraft({
            title: `New ${quickEntryType}`,
            startsAtUtc: range.startsAtUtc,
            endsAtUtc: range.endsAtUtc
          })
        }
        onMoveItem={(input) => moveOccurrence(input.itemId, input.startsAtUtc, input.endsAtUtc)}
        onQuickAdd={createFromDraft}
        onResizeItem={(input) => resizeOccurrence(input.itemId, input.endsAtUtc)}
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
          <div className="space-y-4">
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
              {selectedOccurrence.sourceRuleId ? (
                <p className="text-xs text-text-muted">Changes will apply to all occurrences in this series.</p>
              ) : null}
            </div>

            {selectedEntry.entryType === "practice" ? (
              <div className="space-y-2 rounded-control border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Invite team</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    onChange={(event) => setInviteTeamId(event.target.value)}
                    options={activeTeams.map((team) => ({ label: team.label, value: team.id }))}
                    value={inviteTeamId}
                  />
                  <Button
                    disabled={!canWrite || !inviteTeamId}
                    onClick={() => {
                      upsertInviteOptimistically({
                        occurrenceId: selectedOccurrence.id,
                        teamId: inviteTeamId,
                        role: "participant",
                        inviteStatus: "pending",
                        invitedAt: new Date().toISOString()
                      });
                      startSaving(async () => {
                        const result = await inviteTeamToOccurrenceAction({
                          orgSlug,
                          occurrenceId: selectedOccurrence.id,
                          teamId: inviteTeamId
                        });

                        if (!result.ok) {
                          toast({
                            title: "Unable to invite team",
                            description: result.error,
                            variant: "destructive"
                          });
                          refreshWorkspace();
                          return;
                        }

                        refreshWorkspace("Invite sent");
                      });
                    }}
                    size="sm"
                    type="button"
                  >
                    Send invite
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Teams</p>
              {selectedInvites.length === 0 ? <p className="text-sm text-text-muted">No team participants.</p> : null}
              {selectedInvites.map((invite) => (
                <div className="rounded-control border bg-surface px-2 py-1 text-xs" key={invite.id}>
                  {invite.teamId} · {invite.role} · {invite.inviteStatus}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canWrite || selectedOccurrence.status === "cancelled"}
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
                        title: "Unable to cancel occurrence",
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
                Cancel occurrence
              </Button>
              <Button
                disabled={!canWrite || selectedOccurrence.status === "scheduled"}
                onClick={() => {
                  setReadModel((current) => ({
                    ...current,
                    occurrences: current.occurrences.map((occurrence) =>
                      occurrence.id === selectedOccurrence.id ? { ...occurrence, status: "scheduled", updatedAt: new Date().toISOString() } : occurrence
                    )
                  }));
                  startSaving(async () => {
                    const result = await setOccurrenceStatusAction({
                      orgSlug,
                      occurrenceId: selectedOccurrence.id,
                      status: "scheduled"
                    });

                    if (!result.ok) {
                      toast({
                        title: "Unable to restore occurrence",
                        description: result.error,
                        variant: "destructive"
                      });
                      refreshWorkspace();
                      return;
                    }

                    refreshWorkspace("Occurrence restored");
                  });
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Restore occurrence
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>
    </Card>
  );
}
