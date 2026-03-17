"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { CalendarPicker } from "@orgframe/ui/ui/calendar-picker";
import { Card, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Input } from "@orgframe/ui/ui/input";
import { Panel, PanelScreens } from "@orgframe/ui/ui/panel";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import { UnifiedCalendar, type UnifiedCalendarQuickAddDraft } from "@orgframe/ui/calendar/UnifiedCalendar";
import {
  createCalendarEntryAction,
  createManualOccurrenceAction,
  deleteCalendarLensViewAction,
  deleteOccurrenceAction,
  getCalendarWorkspaceDataAction,
  saveCalendarLensViewAction,
  setDefaultCalendarLensViewAction,
  listCalendarLensViewsAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateCalendarEntryAction,
  updateRecurringOccurrenceAction,
  upsertCalendarRuleAction,
  updateOccurrenceAction
} from "@/modules/calendar/actions";
import type {
  CalendarEntry,
  CalendarEntryType,
  CalendarLensSavedView,
  CalendarLensState,
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
  findEntryForOccurrence,
  findOccurrence,
  replaceOptimisticIds,
  toCalendarItems,
  toLocalParts
} from "@orgframe/ui/modules/calendar/components/workspace-utils";
import { FacilityBookingDialog } from "@orgframe/ui/modules/calendar/components/FacilityBookingDialog";
import { UniversalSharePopup, type ShareTarget } from "@orgframe/ui/modules/calendar/components/UniversalSharePopup";
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
import { defaultLensState, explainOccurrenceVisibility, filterCalendarReadModelByLens } from "@/modules/calendar/lens";
import { CalendarLensExplorer } from "@orgframe/ui/modules/calendar/components/CalendarLensExplorer";

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
  const [lensState, setLensState] = useState<CalendarLensState>(() => defaultLensState("mine"));
  const [savedViews, setSavedViews] = useState<CalendarLensSavedView[]>([]);
  const [quickEntryType, setQuickEntryType] = useState<CalendarEntryType>("event");
  const [quickHostTeamId, setQuickHostTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [inviteTeamId, setInviteTeamId] = useState<string>(activeTeams[0]?.id ?? "");
  const [quickAddDraft, setQuickAddDraft] = useState<(UnifiedCalendarQuickAddDraft & { open: boolean }) | null>(null);
  const [createScreen, setCreateScreen] = useState<"basics" | "location" | "schedule">("basics");
  const [locationDraft, setLocationDraft] = useState("");
  const [locationMode, setLocationMode] = useState<"tbd" | "other" | "facility">("tbd");
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>("");
  const [facilitySelections, setFacilitySelections] = useState<FacilityBookingSelection[]>([]);
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [bookingMode, setBookingMode] = useState<"quick-add" | "edit-occurrence" | null>(null);
  const [sharePopupOpen, setSharePopupOpen] = useState(false);
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([]);
  const [sharePermission, setSharePermission] = useState<"view" | "comment" | "edit">("view");
  const [editTitle, setEditTitle] = useState("");
  const [editStartsAtLocal, setEditStartsAtLocal] = useState("");
  const [editEndsAtLocal, setEditEndsAtLocal] = useState("");
  const [editLocationDraft, setEditLocationDraft] = useState("");
  const [editScope, setEditScope] = useState<"occurrence" | "following" | "series">("series");
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
  const filteredReadModel = useMemo(
    () =>
      filterCalendarReadModelByLens({
        readModel,
        sources: readModel.sources,
        context: {
          contextType: "org",
          orgId: readModel.entries[0]?.orgId ?? "",
          orgSlug
        },
        lensState
      }),
    [lensState, orgSlug, readModel]
  );
  const whyShown = useMemo(
    () =>
      selectedOccurrenceId
        ? explainOccurrenceVisibility({
            occurrenceId: selectedOccurrenceId,
            readModel: filteredReadModel,
            sources: readModel.sources,
            lensState
          })
        : null,
    [filteredReadModel, lensState, readModel.sources, selectedOccurrenceId]
  );

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
  const shareOptions = useMemo<ShareTarget[]>(() => {
    const teamTargets: ShareTarget[] = activeTeams.map((team) => ({
      id: team.id,
      type: "team",
      label: team.label,
      subtitle: "Team"
    }));

    const divisionTargets = Array.from(
      new Set(
        activeTeams
          .map((team) => {
            const divisionMatch = team.label.match(/\b\d{1,2}U\b/i);
            return divisionMatch ? divisionMatch[0].toUpperCase() : null;
          })
          .filter((value): value is string => Boolean(value))
      )
    ).map((division) => ({
      id: division.toLowerCase(),
      type: "division" as const,
      label: division,
      subtitle: "Division"
    }));

    const programTargets = Array.from(
      new Set(
        activeTeams
          .map((team) => team.label.split("/")[0]?.trim())
          .filter((value): value is string => Boolean(value && value.length > 0))
      )
    ).map((program) => ({
      id: program.toLowerCase(),
      type: "program" as const,
      label: program,
      subtitle: "Program"
    }));

    return [
      ...teamTargets,
      ...divisionTargets,
      ...programTargets,
      { id: "org-admins", type: "admin", label: "Organization Admins", subtitle: "Admin group" },
      { id: "all-coaches", type: "group", label: "All Coaches", subtitle: "Group" },
      { id: "all-managers", type: "group", label: "All Managers", subtitle: "Group" }
    ];
  }, [activeTeams]);

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
      const savedViewsResult = await listCalendarLensViewsAction({ orgSlug, contextType: "org" });
      if (savedViewsResult.ok) {
        setSavedViews(savedViewsResult.data.views);
      }
      if (successTitle) {
        toast({
          title: successTitle,
          variant: "success"
        });
      }
    });
  }

  useEffect(() => {
    startSaving(async () => {
      const result = await listCalendarLensViewsAction({ orgSlug, contextType: "org" });
      if (!result.ok) {
        return;
      }
      setSavedViews(result.data.views);
      const defaultView = result.data.views.find((view) => view.isDefault);
      if (defaultView) {
        setLensState(defaultView.configJson);
      }
    });
  }, [orgSlug]);

  function handleSaveLensView(name: string, isDefault: boolean) {
    startSaving(async () => {
      const result = await saveCalendarLensViewAction({
        orgSlug,
        name,
        contextType: "org",
        isDefault,
        lensState
      });
      if (!result.ok) {
        toast({
          title: "Unable to save view",
          description: result.error,
          variant: "destructive"
        });
        return;
      }
      setSavedViews((current) => [result.data.view, ...current.filter((view) => view.id !== result.data.view.id)]);
      setLensState((current) => ({
        ...current,
        savedViewId: result.data.view.id,
        savedViewName: result.data.view.name
      }));
      toast({
        title: "Calendar view saved",
        variant: "success"
      });
    });
  }

  function handleDeleteLensView(viewId: string) {
    startSaving(async () => {
      const result = await deleteCalendarLensViewAction({ orgSlug, viewId });
      if (!result.ok) {
        toast({
          title: "Unable to delete view",
          description: result.error,
          variant: "destructive"
        });
        return;
      }
      setSavedViews((current) => current.filter((view) => view.id !== viewId));
      setLensState((current) =>
        current.savedViewId === viewId
          ? {
              ...current,
              savedViewId: null,
              savedViewName: null
            }
          : current
      );
    });
  }

  function handleSetDefaultLensView(viewId: string) {
    startSaving(async () => {
      const result = await setDefaultCalendarLensViewAction({
        orgSlug,
        viewId,
        contextType: "org"
      });
      if (!result.ok) {
        toast({
          title: "Unable to set default view",
          description: result.error,
          variant: "destructive"
        });
        return;
      }
      setSavedViews((current) => current.map((view) => ({ ...view, isDefault: view.id === viewId })));
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
    setSharePopupOpen(false);

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
  const composerOpen = createMode || editMode;
  const composerTitle = createMode ? "Create Event" : selectedEntry?.title ?? "Event details";
  const composerSubtitle = createMode
    ? "Build the event interactively: type, time, location, facility spaces, and recurrence."
    : selectedOccurrence && selectedEntry
      ? `${selectedEntry.entryType} · ${selectedOccurrence.status}`
      : "Select a calendar item.";
  const createScreens = [
    { key: "basics", label: "Basics" },
    { key: "location", label: "Location" },
    { key: "schedule", label: "Schedule" }
  ] as const;
  const createScreenIndex = createScreens.findIndex((screen) => screen.key === createScreen);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0">
        <CardTitle>Calendar Workspace</CardTitle>
        <CardDescription>Unified events, practices, and games with drag-create, drag-move, and resize actions.</CardDescription>
        <CalendarLensExplorer
          contextType="org"
          lensState={lensState}
          onDeleteView={handleDeleteLensView}
          onLensStateChange={setLensState}
          onSaveView={handleSaveLensView}
          onSetDefaultView={handleSetDefaultLensView}
          savedViews={savedViews}
          sources={readModel.sources}
          whyShown={whyShown}
        />
      </CardHeader>
      <UnifiedCalendar
        canEdit={canWrite}
        disableHoverGhost={Boolean(selectedOccurrenceId) || Boolean(quickAddDraft?.open) || facilityDialogOpen}
        framed={false}
        quickAddUx="external"
        className="min-h-0 flex-1 px-5 pb-5 md:px-6 md:pb-6"
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
        onCreateRange={(range) =>
          openCreateComposer({
            title: `New ${quickEntryType}`,
            startsAtUtc: range.startsAtUtc,
            endsAtUtc: range.endsAtUtc
          })
        }
        onMoveItem={(input) => moveOccurrence(input.itemId, input.startsAtUtc, input.endsAtUtc)}
        onQuickAddIntent={openCreateComposer}
        onResizeItem={(input) => resizeOccurrence(input.itemId, input.endsAtUtc)}
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
      <UniversalSharePopup
        allowManualPeople={!inviteOnlyShare}
        allowedTypes={inviteOnlyShare ? ["team"] : undefined}
        initialPermission={sharePermission}
        initialTargets={shareTargets}
        onApply={applyShareTargets}
        onClose={() => setSharePopupOpen(false)}
        open={sharePopupOpen}
        options={shareOptions}
        primaryActionLabel={inviteOnlyShare ? "Send invites" : "Share"}
        searchPlaceholder={inviteOnlyShare ? "Add teams to this practice" : undefined}
        selectedLabel={inviteOnlyShare ? "Invited teams" : "Shared with"}
        showPermissionControl={!inviteOnlyShare}
        subtitle={
          inviteOnlyShare
            ? "Invite other teams to join this practice."
            : "Search and share with teams, divisions, programs, people, admins, and groups."
        }
        title={inviteOnlyShare ? "Invite Teams" : "Share"}
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
              <Button disabled={!canWrite || !editTitle.trim()} onClick={submitEditComposer} type="button">
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
          <div className="space-y-4">
            <PanelScreens activeKey={createScreen} onChange={(key) => setCreateScreen(key as typeof createScreen)} screens={createScreens as unknown as { key: string; label: string }[]} />

            {createScreen === "basics" ? (
              <>
                <label className="space-y-1 text-xs text-text-muted">
                  <span>Title</span>
                  <Input
                    onChange={(event) => setQuickAddDraft((current) => (current ? { ...current, title: event.target.value, open: true } : current))}
                    placeholder="Event title"
                    value={quickAddDraft.title}
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Type</p>
                  <div className="flex flex-wrap gap-2">
                    {(["event", "practice", "game"] as const).map((type) => (
                      <Button
                        key={type}
                        onClick={() => setQuickEntryType(type)}
                        size="sm"
                        type="button"
                        variant={quickEntryType === type ? "primary" : "ghost"}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>

                {quickEntryType === "practice" ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Host Team</p>
                    <div className="flex flex-wrap gap-2">
                      {activeTeams.map((team) => (
                        <Button
                          key={team.id}
                          onClick={() => setQuickHostTeamId(team.id)}
                          size="sm"
                          type="button"
                          variant={quickHostTeamId === team.id ? "primary" : "ghost"}
                        >
                          {team.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
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
                    <Input onChange={(event) => setLocationDraft(event.target.value)} placeholder="Enter address or custom location" value={locationDraft} />
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
          </div>
        ) : null}

        {editMode && selectedOccurrence && selectedEntry ? (
          <div className="space-y-4">
            <label className="space-y-1 text-xs text-text-muted">
              <span>Title</span>
              <Input onChange={(event) => setEditTitle(event.target.value)} value={editTitle} />
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
              <Input onChange={(event) => setEditLocationDraft(event.target.value)} value={editLocationDraft} />
            </label>

            {selectedOccurrence.sourceRuleId ? (
              <div className="space-y-2 rounded-control border p-3">
                <label className="space-y-1 text-xs text-text-muted">
                  <span>Apply changes to</span>
                  <Select
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{inviteOnlyShare ? "Invites" : "Sharing"}</p>
                <Button onClick={() => setSharePopupOpen(true)} size="sm" type="button" variant="secondary">
                  {inviteOnlyShare ? "Invite" : "Share"}
                </Button>
              </div>
              {visibleShareTargets.length === 0 ? (
                <p className="text-sm text-text-muted">{inviteOnlyShare ? "No teams invited yet." : "Not shared yet."}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {visibleShareTargets.slice(0, 8).map((target) => (
                  <span className="rounded-full border bg-surface px-2 py-1 text-xs" key={`${target.type}:${target.id}`}>
                    {target.label} · {target.type}
                  </span>
                ))}
              </div>
              {!inviteOnlyShare ? <p className="text-xs text-text-muted">Permission: {sharePermission}</p> : null}
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

            <Button
              className="w-full"
              disabled={!canWrite}
              onClick={() => {
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
                      title: "Unable to delete occurrence",
                      description: result.error,
                      variant: "destructive"
                    });
                    refreshWorkspace();
                    return;
                  }

                  refreshWorkspace("Occurrence deleted");
                });
              }}
              type="button"
              variant="ghost"
            >
              Delete occurrence
            </Button>
          </div>
        ) : null}
      </Panel>
    </Card>
  );
}
