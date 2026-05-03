"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Card, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { CreateModal } from "@orgframe/ui/primitives/interaction-containers";
import { Panel, PanelScreens } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Calendar, type CalendarQuickAddDraft } from "@/src/features/calendar/components/Calendar";
import { useCalendarEntryComposer } from "@/src/features/calendar/components/CalendarEntryComposer";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  deleteRecurringOccurrenceAction,
  deleteOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateCalendarEntryAction,
  updateRecurringOccurrenceAction,
  upsertCalendarRuleAction,
  updateOccurrenceAction
} from "@/src/features/calendar/actions";
import type {
  CalendarEntry,
  CalendarEntryType,
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
import { useOrgSharePopup } from "@/src/features/org-share/OrgShareProvider";
import type { ShareTarget } from "@/src/features/org-share/types";
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

type ManageCalendarSectionProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

export function ManageCalendarSection({ orgSlug, canWrite, initialReadModel, initialFacilityReadModel, activeTeams }: ManageCalendarSectionProps) {
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
  const [quickEntryType, setQuickEntryType] = useState<CalendarEntryType>("event");
  const [quickHostTeamId, setQuickHostTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [inviteTeamId, setInviteTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [quickAddDraft, setQuickAddDraft] = useState<(CalendarQuickAddDraft & { open: boolean }) | null>(null);
  const [createScreen, setCreateScreen] = useState<"basics" | "location" | "schedule">("basics");
  const [locationDraft, setLocationDraft] = useState("");
  const [locationMode, setLocationMode] = useState<"tbd" | "other" | "facility">("tbd");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("");
  const [facilitySelections, setFacilitySelections] = useState<FacilityBookingSelection[]>([]);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState<"quick-add" | "edit-occurrence" | null>(null);
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([]);
  const [sharePermission, setSharePermission] = useState<"view" | "comment" | "edit">("view");
  const [editTitle, setEditTitle] = useState("");
  const [editStartsAtLocal, setEditStartsAtLocal] = useState("");
  const [editEndsAtLocal, setEditEndsAtLocal] = useState("");
  const [editLocationDraft, setEditLocationDraft] = useState("");
  const [editScope, setEditScope] = useState<"occurrence" | "following" | "series">("series");
  const [pendingRecurringMutation, setPendingRecurringMutation] = useState<{
    type: "move" | "resize" | "delete";
    occurrenceId: string;
    startsAtUtc?: string;
    endsAtUtc?: string;
  } | null>(null);
  const [pendingRecurringScope, setPendingRecurringScope] = useState<"occurrence" | "following" | "series">("occurrence");
  const { openShare } = useOrgSharePopup();
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
  const teamLabelById = useMemo(() => buildTeamLabelById(activeTeams), [activeTeams]);
  const filteredReadModel = useMemo(() => filterCalendarReadModelBySelectedSources(readModel, selectedSourceIds), [readModel, selectedSourceIds]);

  const calendarItems = useMemo(
    () =>
      toCalendarItems(filteredReadModel, {
        teamLabelById
      }),
    [filteredReadModel, teamLabelById]
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

  useEffect(() => {
    if (!selectedOccurrence || !selectedEntry) {
      setEditTitle("");
      setEditStartsAtLocal("");
      setEditEndsAtLocal("");
      setEditLocationDraft("");
      setShareTargets([]);
      setSharePermission("view");
      return;
    }

    setEditTitle(selectedEntry.title);
    setEditStartsAtLocal(toLocalInputValue(selectedOccurrence.startsAtUtc));
    setEditEndsAtLocal(toLocalInputValue(selectedOccurrence.endsAtUtc));
    setEditLocationDraft(selectedLocation);

    const metadataShareRaw = selectedOccurrence.metadataJson?.sharing;
    const metadataShare = metadataShareRaw && typeof metadataShareRaw === "object" ? (metadataShareRaw as Record<string, unknown>) : null;
    const metadataTargets = Array.isArray(metadataShare?.targets)
      ? metadataShare.targets
          .map((target) => {
            if (!target || typeof target !== "object") {
              return null;
            }
            const candidate = target as Record<string, unknown>;
            if (typeof candidate.id !== "string" || typeof candidate.type !== "string" || typeof candidate.label !== "string") {
              return null;
            }
            const mapped: ShareTarget = {
              id: candidate.id,
              type: candidate.type as ShareTarget["type"],
              label: candidate.label
            };
            if (typeof candidate.subtitle === "string") {
              mapped.subtitle = candidate.subtitle;
            }
            return mapped;
          })
          .filter((target): target is ShareTarget => target !== null)
      : [];

    const inviteTargets: ShareTarget[] = selectedInvites.map((invite) => ({
      id: invite.teamId,
      type: "team",
      label: activeTeams.find((team) => team.id === invite.teamId)?.label ?? invite.teamId,
      subtitle: `Invite: ${invite.inviteStatus}`
    }));

    const dedup = new Map<string, ShareTarget>();
    [...metadataTargets, ...inviteTargets].forEach((target) => {
      dedup.set(`${target.type}:${target.id}`, target);
    });
    setShareTargets(Array.from(dedup.values()));
    setSharePermission(metadataShare?.permission === "edit" ? "edit" : metadataShare?.permission === "comment" ? "comment" : "view");
  }, [activeTeams, selectedEntry, selectedInvites, selectedLocation, selectedOccurrence]);

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

  const composer = useCalendarEntryComposer({
    orgSlug,
    canWrite,
    readModel,
    setReadModel,
    facilityReadModel,
    refreshWorkspace,
    onSelectedOccurrenceChange: setSelectedOccurrenceId,
    removeOptimistic,
    createdViaTag: "manage_calendar"
  });

  function createFromDraft(draft: CalendarQuickAddDraft) {
    const now = new Date().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const optimisticEntryId = buildOptimisticId("optimistic-entry");
    const optimisticOccurrenceId = buildOptimisticId("optimistic-occurrence");
    const startParts = toLocalParts(draft.startsAtUtc, timezone);
    const endParts = toLocalParts(draft.endsAtUtc, timezone);
    const isRecurring = ruleDraft.repeatEnabled;
    const locationValue = locationDraft.trim();
    const visibility = quickEntryType === "practice" ? "internal" : "published";
    const optimisticEntry: CalendarEntry = {
      id: optimisticEntryId,
      orgId: resolveOrgId(readModel),
      sourceId: null,
      entryType: quickEntryType,
      purpose: quickEntryType === "game" ? "games" : quickEntryType === "practice" ? "practices" : "custom_other",
      audience: visibility === "published" ? "public" : "private_internal",
      title: draft.title,
      summary: "",
      visibility,
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
        sourceId: null,
        purpose: quickEntryType === "game" ? "games" : quickEntryType === "practice" ? "practices" : "custom_other",
        audience: quickEntryType === "practice" ? "staff" : "public",
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

  function openCreateComposer(draft: CalendarQuickAddDraft) {
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
    const startsAtUtc = quickAddDraft.startsAtUtc;
    const endsAtUtc = quickAddDraft.endsAtUtc;
    if (!title) {
      toast({
        title: "Title required",
        description: "Add a title before creating this event.",
        variant: "destructive"
      });
      return;
    }
    if (new Date(endsAtUtc).getTime() <= new Date(startsAtUtc).getTime()) {
      toast({
        title: "Invalid time range",
        description: "End time must be after start time.",
        variant: "destructive"
      });
      return;
    }

    createFromDraft({
      title,
      startsAtUtc,
      endsAtUtc
    });
    setQuickAddDraft(null);
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
        allocation.occurrenceId === selectedOccurrence.id
          ? { ...allocation, startsAtUtc: nextStartsAtUtc, endsAtUtc: nextEndsAtUtc, updatedAt: now }
          : allocation
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

  function applyShareTargets(input: { targets: ShareTarget[]; permission: "view" | "comment" | "edit" }) {
    const inviteOnly = selectedEntry?.entryType === "practice";
    const scopedTargets = inviteOnly ? input.targets.filter((target) => target.type === "team") : input.targets;
    const scopedPermission = inviteOnly ? "view" : input.permission;
    setShareTargets(scopedTargets);
    setSharePermission(scopedPermission);

    if (!selectedOccurrence || !selectedEntry) {
      return;
    }

    const nextMetadata = {
      ...selectedOccurrence.metadataJson,
      sharing: {
        permission: scopedPermission,
        targets: scopedTargets,
        updatedAt: new Date().toISOString()
      }
    };
    const startParts = toLocalParts(selectedOccurrence.startsAtUtc, selectedOccurrence.timezone);
    const endParts = toLocalParts(selectedOccurrence.endsAtUtc, selectedOccurrence.timezone);

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((occurrence) =>
        occurrence.id === selectedOccurrence.id ? { ...occurrence, metadataJson: nextMetadata, updatedAt: new Date().toISOString() } : occurrence
      )
    }));

    startSaving(async () => {
      const teamTargets = scopedTargets.filter((target) => target.type === "team");
      for (const target of teamTargets) {
        const alreadyInvited = selectedInvites.some((invite) => invite.teamId === target.id);
        if (alreadyInvited) {
          continue;
        }
        upsertInviteOptimistically({
          occurrenceId: selectedOccurrence.id,
          teamId: target.id,
          role: "participant",
          inviteStatus: "pending",
          invitedAt: new Date().toISOString()
        });
        await inviteTeamToOccurrenceAction({
          orgSlug,
          occurrenceId: selectedOccurrence.id,
          teamId: target.id
        }).catch(() => null);
      }

      const updateResult = await updateOccurrenceAction({
        orgSlug,
        occurrenceId: selectedOccurrence.id,
        entryId: selectedOccurrence.entryId,
        timezone: selectedOccurrence.timezone,
        localDate: startParts.localDate,
        localStartTime: startParts.localTime,
        localEndTime: endParts.localTime,
        metadataJson: nextMetadata
      });

      if (!updateResult.ok) {
        toast({
          title: "Unable to update sharing",
          description: updateResult.error,
          variant: "destructive"
        });
        refreshWorkspace();
        return;
      }

      refreshWorkspace("Sharing updated");
    });
  }

  function openShareDialog() {
    const inviteOnly = selectedEntry?.entryType === "practice";
    void openShare({
      allowManualPeople: !inviteOnly,
      allowedTypes: inviteOnly ? ["team"] : undefined,
      initialPermission: sharePermission,
      initialTargets: shareTargets,
      onApply: applyShareTargets,
      primaryActionLabel: inviteOnly ? "Send invites" : "Share",
      searchPlaceholder: inviteOnly ? "Add teams to this practice" : undefined,
      selectedLabel: inviteOnly ? "Invited teams" : "Shared with",
      showPermissionControl: !inviteOnly,
      subtitle: inviteOnly
        ? "Invite other teams to join this practice."
        : "Search and share with teams, divisions, programs, people, admins, and groups.",
      title: inviteOnly ? "Invite Teams" : "Share"
    });
  }

  async function runRecurringMutation(input: { occurrenceId: string; startsAtUtc: string; endsAtUtc: string; scope: "occurrence" | "following" | "series" }) {
    const occurrence = findOccurrence(readModel, input.occurrenceId);
    if (!occurrence || !occurrence.sourceRuleId) {
      return;
    }
    const entry = findEntryForOccurrence(readModel, occurrence);
    const rule = readModel.rules.find((item) => item.id === occurrence.sourceRuleId) ?? null;
    if (!entry || !rule) {
      return;
    }

    const ruleShape = scheduleDraftFromCalendarRule(rule);
    const startParts = toLocalParts(input.startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(input.endsAtUtc, occurrence.timezone);
    const result = await updateRecurringOccurrenceAction({
      orgSlug,
      occurrenceId: occurrence.id,
      editScope: input.scope,
      entryType: entry.entryType,
      title: entry.title,
      summary: entry.summary ?? "",
      visibility: entry.visibility,
      status: entry.status,
      hostTeamId: entry.hostTeamId,
      timezone: occurrence.timezone,
      location: resolveEntryLocation(entry),
      localDate: startParts.localDate,
      localStartTime: startParts.localTime,
      localEndTime: endParts.localTime,
      metadataJson: occurrence.metadataJson,
      recurrence: {
        mode: ruleShape.mode,
        timezone: ruleShape.timezone,
        startDate: ruleShape.startDate,
        endDate: ruleShape.endDate,
        startTime: ruleShape.startTime,
        endTime: ruleShape.endTime,
        intervalCount: ruleShape.intervalCount,
        intervalUnit: ruleShape.intervalUnit,
        byWeekday: ruleShape.byWeekday,
        byMonthday: ruleShape.byMonthday,
        endMode: ruleShape.endMode,
        untilDate: ruleShape.untilDate,
        maxOccurrences: ruleShape.maxOccurrences ? Number.parseInt(ruleShape.maxOccurrences, 10) : null,
        configJson: {
          specificDates: ruleShape.specificDates
        }
      },
      copyForwardInvites: true,
      copyForwardFacilities: true
    });
    if (!result.ok) {
      toast({
        title: "Unable to update recurring event",
        description: result.error,
        variant: "destructive"
      });
      refreshWorkspace();
      return;
    }

    refreshWorkspace("Recurring event updated");
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

    if (occurrence.sourceRuleId) {
      setPendingRecurringMutation({
        type: "move",
        occurrenceId: occurrence.id,
        startsAtUtc,
        endsAtUtc
      });
      setPendingRecurringScope("occurrence");
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

    if (occurrence.sourceRuleId) {
      setPendingRecurringMutation({
        type: "resize",
        occurrenceId: occurrence.id,
        startsAtUtc: occurrence.startsAtUtc,
        endsAtUtc
      });
      setPendingRecurringScope("occurrence");
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

  const createMode = Boolean(quickAddDraft?.open);
  const editMode = Boolean(selectedOccurrence && selectedEntry);
  const inviteOnlyShare = selectedEntry?.entryType === "practice";
  const visibleShareTargets = inviteOnlyShare ? shareTargets.filter((target) => target.type === "team") : shareTargets;
  const composerOpen = createMode;
  const composerTitle = "Create Event";
  const composerSubtitle = "Build the event interactively: type, time, location, facility spaces, and recurrence.";
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry
      ? `${selectedEntry.entryType} · ${new Date(selectedOccurrence.startsAtUtc).toLocaleString()}`
      : "Event details";
  const createScreens = [
    { key: "basics", label: "Basics" },
    { key: "location", label: "Location" },
    { key: "schedule", label: "Schedule" }
  ] as const;
  const createScreenIndex = createScreens.findIndex((screen) => screen.key === createScreen);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle>Calendar Workspace</CardTitle>
        <CardDescription>Events, practices, and games with drag-create, drag-move, and resize actions.</CardDescription>
      </CardHeader>
      <Calendar
        canEdit={canWrite}
        disableHoverGhost={Boolean(selectedOccurrenceId) || composer.isOpen || facilityDialogOpen}
        framed={false}
        quickAddUx="external"
        referenceTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        className="min-h-0 flex-1 overflow-hidden px-5 pb-5 md:px-6 md:pb-6"
        controlsSlot={
          <CalendarSourceFilterPopover onChange={setSelectedSourceIds} selectedSourceIds={selectedSourceIds} sources={readModel.sources} />
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
          return null;
        }}
        items={calendarItems}
        onCreateRange={(range) =>
          composer.open({
            title: "New event",
            startsAtUtc: range.startsAtUtc,
            endsAtUtc: range.endsAtUtc
          })
        }
        onMoveItem={(input) => moveOccurrence(input.itemId, input.startsAtUtc, input.endsAtUtc)}
        onCancelCreate={composer.close}
        onQuickAddIntent={composer.open}
        onResizeItem={(input) => resizeOccurrence(input.itemId, input.endsAtUtc)}
        onSelectItem={(occurrenceId) => {
          composer.close();
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
      {composer.element}
      <Panel onClose={() => setSelectedOccurrenceId(null)} open={editMode} subtitle={eventPanelSubtitle} title={selectedEntry?.title ?? "Event details"}>
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

            <div className="space-y-2 rounded-control border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {inviteOnlyShare ? "Invited teams" : "Sharing"}
                </p>
                <Button disabled={!canWrite} onClick={openShareDialog} size="sm" type="button" variant="secondary">
                  {inviteOnlyShare ? "Invite teams" : "Share"}
                </Button>
              </div>
              {visibleShareTargets.length === 0 ? <p className="text-sm text-text-muted">No recipients selected.</p> : null}
              {visibleShareTargets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {visibleShareTargets.map((target) => (
                    <Chip className="normal-case tracking-normal" color="neutral" key={`${target.type}:${target.id}`} size="compact">
                      {target.label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>

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

            <Button disabled={!canWrite || !editTitle.trim()} onClick={submitEditComposer} type="button">
              Save changes
            </Button>
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
                  if (mutation.type === "delete") {
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
                    return;
                  }

                  if (!mutation.startsAtUtc || !mutation.endsAtUtc) {
                    return;
                  }
                  await runRecurringMutation({
                    occurrenceId: mutation.occurrenceId,
                    startsAtUtc: mutation.startsAtUtc,
                    endsAtUtc: mutation.endsAtUtc,
                    scope: pendingRecurringScope
                  });
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
        subtitle="Choose how far this recurring change should apply."
        title="Apply Recurring Change"
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
    </Card>
  );
}
