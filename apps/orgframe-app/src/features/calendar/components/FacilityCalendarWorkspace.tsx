"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Check } from "lucide-react";
import { Calendar, type CalendarQuickAddDraft } from "@/src/features/calendar/components/Calendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateCalendarEntryAction,
  updateOccurrenceAction,
  updateRecurringOccurrenceAction,
  upsertCalendarRuleAction
} from "@/src/features/calendar/actions";
import type {
  CalendarEntry,
  CalendarOccurrence,
  CalendarReadModel,
  FacilityAllocation,
  OccurrenceTeamInvite
} from "@/src/features/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/src/features/facilities/types";
import { RecurringEventEditor } from "@/src/features/calendar/components/RecurringEventEditor";
import {
  buildCalendarRuleInputFromDraft,
  buildOccurrenceWindowsFromRuleDraft,
  buildRuleDraftFromWindow,
  scheduleDraftFromCalendarRule,
  syncRuleDraftWithWindow
} from "@/src/features/calendar/components/recurrence-utils";
import type { ScheduleRuleDraft } from "@/src/features/programs/schedule/components/types";
import { generateOccurrencesForRule } from "@/src/features/calendar/rule-engine";
import {
  buildTeamLabelById,
  buildInitialSelectedSourceIds,
  filterCalendarReadModelBySelectedSources,
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@/src/features/calendar/components/workspace-utils";
import { FacilityBookingDialog } from "@/src/features/calendar/components/FacilityBookingDialog";
import { CalendarSourceFilterPopover } from "@/src/features/calendar/components/CalendarSourceFilterPopover";
import { ScrollableSheetBody } from "@/src/features/calendar/components/ScrollableSheetBody";
import { UniversalAddressField } from "@/src/features/calendar/components/UniversalAddressField";
import {
  buildSpaceById,
  computeFacilityConflicts,
  formatFacilityLocation,
  getFacilityAddress,
  resolveRootSpaceId,
  resolveFacilityStatusDot,
  type FacilityBookingSelection,
  type FacilityBookingWindow
} from "@/src/features/calendar/components/facility-booking-utils";

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

type FacilityCalendarWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  spaceId: string;
  spaceName: string;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

export function FacilityCalendarWorkspace({
  orgSlug,
  canWrite,
  spaceId,
  spaceName,
  initialReadModel,
  initialFacilityReadModel,
  activeTeams
}: FacilityCalendarWorkspaceProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [facilityReadModel, setFacilityReadModel] = useState<FacilityReservationReadModel>(
    initialFacilityReadModel ?? {
      spaces: [],
      spaceStatuses: [],
      rules: [],
      reservations: [],
      exceptions: []
    }
  );
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => buildInitialSelectedSourceIds(initialReadModel.sources));
  const [hostTeamId, setHostTeamId] = useState(activeTeams[0]?.id ?? "");
  const [configurationId, setConfigurationId] = useState<string>("");
  const [inviteTeamId, setInviteTeamId] = useState(activeTeams[0]?.id ?? "");
  const [quickAddDraft, setQuickAddDraft] = useState<(CalendarQuickAddDraft & { open: boolean }) | null>(null);
  const [locationDraft, setLocationDraft] = useState(spaceName);
  const [locationMode, setLocationMode] = useState<"tbd" | "other" | "facility">("facility");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("");
  const [facilitySelections, setFacilitySelections] = useState<FacilityBookingSelection[]>([]);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState<"quick-add" | "edit-occurrence" | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStartsAtLocal, setEditStartsAtLocal] = useState("");
  const [editEndsAtLocal, setEditEndsAtLocal] = useState("");
  const [editLocationDraft, setEditLocationDraft] = useState("");
  const [editScope, setEditScope] = useState<"occurrence" | "following" | "series">("series");
  const [ruleDraft, setRuleDraft] = useState<ScheduleRuleDraft>(() =>
    buildRuleDraftFromWindow(new Date().toISOString(), new Date(Date.now() + 60 * 60 * 1000).toISOString(), Intl.DateTimeFormat().resolvedOptions().timeZone)
  );
  const optimisticIdRef = useRef(0);
  const [, startSaving] = useTransition();

  const spaceConfigurations = useMemo(
    () => readModel.configurations.filter((configuration) => configuration.spaceId === spaceId && configuration.isActive),
    [readModel.configurations, spaceId]
  );

  const spaceById = useMemo(() => buildSpaceById(facilityReadModel.spaces), [facilityReadModel.spaces]);
  const rootFacilityId = useMemo(() => resolveRootSpaceId(spaceId, spaceById) ?? "", [spaceById, spaceId]);
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
  const teamLabelById = useMemo(() => buildTeamLabelById(activeTeams), [activeTeams]);
  const filteredReadModel = useMemo(() => filterCalendarReadModelBySelectedSources(readModel, selectedSourceIds), [readModel, selectedSourceIds]);

  useEffect(() => {
    if (locationMode === "facility" && !selectedFacilityId && rootFacilityId) {
      setSelectedFacilityId(rootFacilityId);
    }
  }, [locationMode, rootFacilityId, selectedFacilityId]);

  useEffect(() => {
    if (!quickAddDraft?.open) {
      setLocationDraft(spaceName);
      setLocationMode("facility");
      setSelectedFacilityId(rootFacilityId || "");
      setFacilitySelections([]);
      setBookingMode(null);
      return;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startValue = quickAddDraft.startsAtUtc;
    const endValue = quickAddDraft.endsAtUtc;

    setRuleDraft((current) => syncRuleDraftWithWindow(current, startValue, endValue, timezone));
  }, [quickAddDraft?.endsAtUtc, quickAddDraft?.open, quickAddDraft?.startsAtUtc, rootFacilityId, spaceName]);

  useEffect(() => {
    if (!quickAddDraft?.open) {
      return;
    }
    setFacilitySelections((current) => {
      const nextConfigId = configurationId || undefined;
      const existing = current.find((selection) => selection.spaceId === spaceId);
      if (existing) {
        return current.map((selection) =>
          selection.spaceId === spaceId ? { ...selection, configurationId: nextConfigId } : selection
        );
      }
      return [
        {
          spaceId,
          configurationId: nextConfigId,
          lockMode: "exclusive",
          allowShared: true,
          notes: ""
        },
        ...current
      ];
    });
  }, [configurationId, quickAddDraft?.open, spaceId]);

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

  const filteredItems = useMemo(() => {
    const occurrenceIds = new Set(
      filteredReadModel.allocations.filter((allocation) => allocation.spaceId === spaceId && allocation.isActive).map((allocation) => allocation.occurrenceId)
    );

    const scopedReadModel: CalendarReadModel = {
      ...filteredReadModel,
      occurrences: filteredReadModel.occurrences.filter((occurrence) => occurrenceIds.has(occurrence.id))
    };

    return toCalendarItems(scopedReadModel, { teamLabelById });
  }, [filteredReadModel, spaceId, teamLabelById]);

  const selectedOccurrence = useMemo(
    () => (selectedOccurrenceId ? findOccurrence(filteredReadModel, selectedOccurrenceId) : null),
    [filteredReadModel, selectedOccurrenceId]
  );
  const selectedEntry = useMemo(
    () => (selectedOccurrence ? findEntryForOccurrence(filteredReadModel, selectedOccurrence) : null),
    [filteredReadModel, selectedOccurrence]
  );
  const selectedAllocations = useMemo(
    () => (selectedOccurrence ? filteredReadModel.allocations.filter((allocation) => allocation.occurrenceId === selectedOccurrence.id) : []),
    [filteredReadModel.allocations, selectedOccurrence]
  );
  const selectedAllocationForSpace = useMemo(
    () => selectedAllocations.find((allocation) => allocation.spaceId === spaceId) ?? null,
    [selectedAllocations, spaceId]
  );
  const selectedLocation = useMemo(() => resolveEntryLocation(selectedEntry), [selectedEntry]);

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
    return model.entries[0]?.orgId ?? model.occurrences[0]?.orgId ?? model.allocations[0]?.orgId ?? "";
  }

  const eventPanelOpen = Boolean(selectedOccurrence && selectedEntry);
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry
      ? `${selectedEntry.entryType} · ${new Date(selectedOccurrence.startsAtUtc).toLocaleString()}`
      : "Select a calendar item to manage invites and configuration.";

  function buildOptimisticId(prefix: string) {
    const next = optimisticIdRef.current++;
    return `${prefix}-${next}`;
  }

  function removeOptimistic(optimisticEntryId: string, optimisticOccurrenceId: string) {
    setReadModel((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== optimisticEntryId),
      occurrences: current.occurrences.filter((occurrence) => occurrence.id !== optimisticOccurrenceId),
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
          title: "Unable to refresh facility calendar",
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
      for (const source of readModel.sources) {
        if (current.has(source.id) || source.isActive) {
          next.add(source.id);
        }
      }
      return next;
    });
  }, [readModel.sources]);

  function createPracticeBooking(draft: CalendarQuickAddDraft) {
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
      audience: "staff",
      title: draft.title,
      summary: "",
      visibility: "internal",
      status: "scheduled",
      hostTeamId: hostTeamId || null,
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
        createdVia: "facility_workspace",
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
      if (!hostTeamId) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Host team required",
          description: "Select a host team before creating a facility practice booking.",
          variant: "destructive"
        });
        return;
      }

      const entryResult = await createCalendarEntryAction({
        orgSlug,
        sourceId: null,
        purpose: "practices",
        audience: "staff",
        entryType: "practice",
        title: draft.title,
        summary: "",
        visibility: "internal",
        status: "scheduled",
        hostTeamId,
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

        refreshWorkspace("Facility practice schedule created");
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
          createdVia: "facility_workspace"
        }
      });

      if (!occurrenceResult.ok) {
        removeOptimistic(optimisticEntryId, optimisticOccurrenceId);
        toast({
          title: "Unable to create facility occurrence",
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

      refreshWorkspace("Facility practice booked");
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

  function submitEditComposer() {
    if (!selectedOccurrence || !selectedEntry) {
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

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{spaceName} Calendar</CardTitle>
        <CardDescription>Book practices against facility configurations with strict conflict locking and optional shared invites.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            disabled={!canWrite}
            onChange={(event) => setHostTeamId(event.target.value)}
            options={activeTeams.length > 0 ? activeTeams.map((team) => ({ label: team.label, value: team.id })) : [{ label: "No teams", value: "" }]}
            value={hostTeamId}
          />
          <Select
            disabled={!canWrite}
            onChange={(event) => setConfigurationId(event.target.value)}
            options={
              spaceConfigurations.length > 0
                ? [{ label: "Auto default configuration", value: "" }, ...spaceConfigurations.map((config) => ({ label: config.name, value: config.id }))]
                : [{ label: "Auto default configuration", value: "" }]
            }
            value={configurationId}
          />
          <Select
            disabled={!canWrite}
            onChange={(event) => setInviteTeamId(event.target.value)}
            options={activeTeams.length > 0 ? activeTeams.map((team) => ({ label: team.label, value: team.id })) : [{ label: "No teams", value: "" }]}
            value={inviteTeamId}
          />
        </div>
        <Calendar
          canEdit={canWrite}
          disableHoverGhost={Boolean(selectedOccurrenceId) || facilityDialogOpen}
          className="min-h-0 flex-1"
          referenceTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          controlsSlot={<CalendarSourceFilterPopover onChange={setSelectedSourceIds} selectedSourceIds={selectedSourceIds} sources={readModel.sources} />}
          getConflictMessage={(draft) => {
            const hasOverlap = filteredItems.some((item) => {
              const start = new Date(item.startsAtUtc).getTime();
              const end = new Date(item.endsAtUtc).getTime();
              const newStart = new Date(draft.startsAtUtc).getTime();
              const newEnd = new Date(draft.endsAtUtc).getTime();
              return newStart < end && newEnd > start;
            });
            if (hasOverlap) {
              return "This slot overlaps another reservation for this facility.";
            }
            if (!ruleDraft.repeatEnabled && quickAddFacilityConflicts?.hasBlockingConflicts) {
              return "Selected facility spaces are already booked.";
            }
            return null;
          }}
          items={filteredItems}
          onQuickAddDraftChange={setQuickAddDraft}
          onCreateRange={(range) =>
            createPracticeBooking({
              title: `${spaceName} practice`,
              startsAtUtc: range.startsAtUtc,
              endsAtUtc: range.endsAtUtc
            })
          }
          onQuickAdd={createPracticeBooking}
          onSelectItem={setSelectedOccurrenceId}
        renderQuickAddFields={() => (
          <div className="space-y-3">
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
              <div className="grid gap-2">
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
                        <Chip className="normal-case tracking-normal" color="neutral" key={selection.spaceId} size="compact">
                          {spaceById.get(selection.spaceId)?.name ?? selection.spaceId}
                        </Chip>
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
            <RecurringEventEditor canWrite={canWrite} draft={ruleDraft} onChange={setRuleDraft} />
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
          saveLabel={bookingMode === "edit-occurrence" ? "Update Booking" : "Apply Booking"}
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
            <ScrollableSheetBody className="space-y-3 pr-1">
              <label className="space-y-1 text-xs text-text-muted">
                <span>Title</span>
                <Input disabled={!canWrite} onChange={(event) => setEditTitle(event.target.value)} value={editTitle} />
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

              <label className="space-y-1 text-xs text-text-muted">
                <span>Location</span>
                <UniversalAddressField disabled={!canWrite} onChange={setEditLocationDraft} value={editLocationDraft} />
              </label>

              {selectedOccurrence.sourceRuleId ? (
                <div className="space-y-2 rounded-control border p-3">
                  <label className="space-y-1 text-xs text-text-muted">
                    <span>Apply changes to</span>
                    <Select
                      disabled={!canWrite}
                      onChange={(event) => setEditScope(event.target.value as typeof editScope)}
                      options={[
                        { label: "This occurrence only", value: "occurrence" },
                        { label: "This and following", value: "following" },
                        { label: "Entire series", value: "series" }
                      ]}
                      value={editScope}
                    />
                  </label>
                  <RecurringEventEditor canWrite={canWrite} draft={ruleDraft} onChange={setRuleDraft} />
                </div>
              ) : null}

              <div className="space-y-2 rounded-control border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Facility booking</p>
                {selectedAllocations.length === 0 ? <p className="text-sm text-text-muted">No facility spaces assigned.</p> : null}
                <div className="flex flex-wrap gap-2">
                  {selectedAllocations.map((allocation) => (
                    <Chip className="normal-case tracking-normal" color="neutral" key={allocation.id} size="compact">
                      {spaceById.get(allocation.spaceId)?.name ?? allocation.spaceId}
                    </Chip>
                  ))}
                </div>
                <Button disabled={!canWrite} onClick={openEditFacilityDialog} size="sm" type="button" variant="secondary">
                  {selectedAllocations.length > 0 ? "Edit facility booking" : "Add facility booking"}
                </Button>
              </div>

              <p className="text-sm text-text-muted">
                Configuration: {spaceConfigurations.find((config) => config.id === selectedAllocationForSpace?.configurationId)?.name ?? "Auto"}
              </p>
              <Button
                disabled={!canWrite || !inviteTeamId}
                onClick={() => {
                  upsertInviteOptimistically({
                    occurrenceId: selectedOccurrence.id,
                    teamId: inviteTeamId,
                    role: "participant",
                    inviteStatus: "pending"
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

                    refreshWorkspace("Team invite sent");
                  });
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                Invite Team to Join
              </Button>
              <Button disabled={!canWrite} onClick={submitEditComposer} type="button">
                <Check className="h-4 w-4" />
                Save Changes
              </Button>
            </ScrollableSheetBody>
          ) : null}
        </Panel>
      </CardContent>
    </Card>
  );
}
