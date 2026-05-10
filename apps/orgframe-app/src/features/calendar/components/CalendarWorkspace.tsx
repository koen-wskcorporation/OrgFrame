"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Card, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Calendar, type CalendarQuickAddDraft } from "@/src/features/calendar/components/Calendar";
import { useCalendarEntryComposer, type CalendarEntryTypeOption } from "@/src/features/calendar/components/CalendarEntryComposer";
import {
  deleteRecurringOccurrenceAction,
  getCalendarWorkspaceDataAction,
  inviteTeamToOccurrenceAction,
  setOccurrenceFacilityAllocationsAction,
  setRuleFacilityAllocationsAction,
  updateCalendarEntryAction,
  updateOccurrenceAction,
  updateRecurringOccurrenceAction
} from "@/src/features/calendar/actions";
import type {
  CalendarEntry,
  CalendarPublicCatalogItem,
  CalendarReadModel,
  OccurrenceTeamInvite
} from "@/src/features/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/src/features/facilities/types";
import { RecurringEventEditor } from "@/src/features/calendar/components/RecurringEventEditor";
import { buildRuleDraftFromWindow, scheduleDraftFromCalendarRule } from "@/src/features/calendar/components/recurrence-utils";
import type { ScheduleRuleDraft } from "@/src/features/programs/schedule/components/types";
import { generateOccurrencesForRule } from "@/src/features/calendar/rule-engine";
import {
  buildTeamLabelById,
  buildInitialSelectedSourceIds,
  filterCalendarReadModelBySelectedSources,
  findEntryForOccurrence,
  findOccurrence,
  toCalendarItems,
  toLocalParts
} from "@/src/features/calendar/components/workspace-utils";
import { FacilityBookingFullscreen } from "@/src/features/calendar/components/FacilityBookingFullscreen";
import { CalendarSourceFilterPopover } from "@/src/features/calendar/components/CalendarSourceFilterPopover";
import { ScrollableSheetBody } from "@/src/features/calendar/components/ScrollableSheetBody";
import { UniversalAddressField } from "@/src/features/calendar/components/UniversalAddressField";
import { Section } from "@orgframe/ui/primitives/section";
import { useOrgSharePopup } from "@/src/features/org-share/OrgShareProvider";
import type { ShareTarget } from "@/src/features/org-share/types";
import {
  buildSpaceById,
  formatFacilityLocation,
  getFacilityAddress,
  resolveRootSpaceId,
  type FacilityBookingSelection,
  type FacilityBookingWindow
} from "@/src/features/calendar/components/facility-booking-utils";

type Team = { id: string; label: string };

const EMPTY_FACILITY_READ_MODEL: FacilityReservationReadModel = {
  facilities: [],
  spaces: [],
  spaceStatuses: [],
  rules: [],
  reservations: [],
  exceptions: []
};

/**
 * Discriminator describing where this calendar is mounted. The component
 * stays the same across surfaces; the context shifts the composer defaults,
 * the item filter, and the chrome around the calendar.
 *
 *  - manage:   org-wide calendar (no scoping)
 *  - team:     team page — composer auto-links new entries to this team
 *  - facility: facility page — composer locks the facility/space
 *  - public:   read-only catalog view (no editing, no actions)
 */
export type CalendarContext =
  | { kind: "manage"; activeTeams: Team[] }
  | { kind: "team"; teamId: string; teamLabel?: string; activeTeams: Team[] }
  | { kind: "facility"; spaceId: string; spaceName: string; activeTeams: Team[] }
  | { kind: "public"; items: CalendarPublicCatalogItem[]; title?: string };

export type CalendarWorkspaceProps = {
  orgSlug: string;
  /** Required for editor contexts; ignored for public. */
  canWrite?: boolean;
  /** Required for editor contexts; ignored for public. */
  initialReadModel?: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  context: CalendarContext;
};

export function CalendarWorkspace(props: CalendarWorkspaceProps) {
  if (props.context.kind === "public") {
    return <PublicCalendarView items={props.context.items} title={props.context.title ?? "Calendar"} />;
  }

  if (!props.initialReadModel) {
    return null;
  }

  return (
    <EditorWorkspace
      canWrite={props.canWrite ?? false}
      context={props.context}
      initialFacilityReadModel={props.initialFacilityReadModel}
      initialReadModel={props.initialReadModel}
      orgSlug={props.orgSlug}
    />
  );
}

function PublicCalendarView({ items, title }: { items: CalendarPublicCatalogItem[]; title: string }) {
  const calendarItems = items.map((item) => ({
    id: item.occurrenceId,
    title: item.title,
    entryType: item.entryType,
    status: "scheduled" as const,
    startsAtUtc: item.startsAtUtc,
    endsAtUtc: item.endsAtUtc,
    timezone: item.timezone,
    summary: item.summary
  }));

  return (
    <Section contentClassName="space-y-3" title={title}>
      <Calendar canEdit={false} items={calendarItems} onSelectItem={() => {}} />
      <div className="space-y-2">
        {items.slice(0, 20).map((item) => (
          <article className="rounded-control border bg-surface px-3 py-2" key={item.occurrenceId}>
            <p className="font-semibold text-text">
              <Link className="hover:underline" href={`/calendar/${item.occurrenceId}`}>
                {item.title}
              </Link>
            </p>
            <p className="text-xs text-text-muted">
              {new Date(item.startsAtUtc).toLocaleString()} - {new Date(item.endsAtUtc).toLocaleString()}
            </p>
            {item.location ? <p className="text-xs text-text-muted">{item.location}</p> : null}
          </article>
        ))}
      </div>
    </Section>
  );
}

function resolveEntryLocation(entry: CalendarEntry | null) {
  if (!entry) return "";
  const location = entry.settingsJson?.location;
  return typeof location === "string" ? location : "";
}

function toLocalInputValue(isoUtc: string) {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToUtcIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type EditorContext = Exclude<CalendarContext, { kind: "public" }>;

type EditorWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  context: EditorContext;
};

function EditorWorkspace({ orgSlug, canWrite, initialReadModel, initialFacilityReadModel, context }: EditorWorkspaceProps) {
  const { toast } = useToast();
  const activeTeams = context.activeTeams;

  const [readModel, setReadModel] = useState(initialReadModel);
  const [facilityReadModel, setFacilityReadModel] = useState<FacilityReservationReadModel>(
    initialFacilityReadModel ?? EMPTY_FACILITY_READ_MODEL
  );
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => buildInitialSelectedSourceIds(initialReadModel.sources));
  const [inviteTeamId, setInviteTeamId] = useState<string>(activeTeams[0]?.id ?? "");
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
  const [editFacilityId, setEditFacilityId] = useState<string>("");
  const [editFacilitySelections, setEditFacilitySelections] = useState<FacilityBookingSelection[]>([]);
  const [editFacilityDialogOpen, setEditFacilityDialogOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<ScheduleRuleDraft>(() =>
    buildRuleDraftFromWindow(
      new Date().toISOString(),
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
  );
  const optimisticIdRef = useRef(0);
  const [, startSaving] = useTransition();
  const { openShare } = useOrgSharePopup();

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
  const teamLabelById = useMemo(() => {
    const map = buildTeamLabelById(activeTeams);
    if (context.kind === "team") {
      const teamLabel = context.teamLabel?.trim();
      if (teamLabel && !map.has(context.teamId)) {
        const normalized = teamLabel
          .split("/")
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0)
          .join("/");
        if (normalized) map.set(context.teamId, normalized);
      }
    }
    return map;
  }, [activeTeams, context]);

  // Context-scoped read model: team filters by invites, facility by allocations.
  const scopedReadModel = useMemo<CalendarReadModel>(() => {
    if (context.kind === "team") {
      const occurrenceIds = new Set(
        readModel.invites
          .filter((invite) => invite.teamId === context.teamId && ["accepted", "pending", "left", "declined"].includes(invite.inviteStatus))
          .map((invite) => invite.occurrenceId)
      );
      return { ...readModel, occurrences: readModel.occurrences.filter((occurrence) => occurrenceIds.has(occurrence.id)) };
    }
    if (context.kind === "facility") {
      const occurrenceIds = new Set(
        readModel.allocations
          .filter((allocation) => allocation.spaceId === context.spaceId && allocation.isActive)
          .map((allocation) => allocation.occurrenceId)
      );
      return { ...readModel, occurrences: readModel.occurrences.filter((occurrence) => occurrenceIds.has(occurrence.id)) };
    }
    return readModel;
  }, [context, readModel]);

  const filteredReadModel = useMemo(
    () => filterCalendarReadModelBySelectedSources(scopedReadModel, selectedSourceIds),
    [scopedReadModel, selectedSourceIds]
  );

  const calendarItems = useMemo(() => toCalendarItems(filteredReadModel, { teamLabelById }), [filteredReadModel, teamLabelById]);

  const spaceById = useMemo(() => buildSpaceById(facilityReadModel.spaces), [facilityReadModel.spaces]);
  const facilityById = useMemo(() => new Map(facilityReadModel.facilities.map((f) => [f.id, f])), [facilityReadModel.facilities]);
  const editFacility = editFacilityId ? facilityById.get(editFacilityId) ?? null : null;
  const editFacilitySpaces = useMemo(
    () => editFacilitySelections.map((selection) => spaceById.get(selection.spaceId)).filter((space): space is FacilitySpace => Boolean(space)),
    [editFacilitySelections, spaceById]
  );

  const facilityRootId = useMemo(() => {
    if (context.kind !== "facility") return null;
    return resolveRootSpaceId(context.spaceId, spaceById);
  }, [context, spaceById]);

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
            if (!target || typeof target !== "object") return null;
            const candidate = target as Record<string, unknown>;
            if (typeof candidate.id !== "string" || typeof candidate.type !== "string" || typeof candidate.label !== "string") return null;
            const mapped: ShareTarget = {
              id: candidate.id,
              type: candidate.type as ShareTarget["type"],
              label: candidate.label
            };
            if (typeof candidate.subtitle === "string") mapped.subtitle = candidate.subtitle;
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

      return { ...current, invites: [...current.invites, optimisticInvite] };
    });
  }

  function refreshWorkspace(successTitle?: string) {
    startSaving(async () => {
      const result = await getCalendarWorkspaceDataAction({ orgSlug });
      if (!result.ok) {
        toast({ title: "Unable to refresh calendar", description: result.error, variant: "destructive" });
        return;
      }
      setReadModel(result.data.readModel);
      setFacilityReadModel(result.data.facilityReadModel);
      if (successTitle) toast({ title: successTitle, variant: "success" });
    });
  }

  useEffect(() => {
    setSelectedSourceIds((current) => {
      const next = new Set<string>();
      for (const source of scopedReadModel.sources) {
        if (current.has(source.id) || source.isActive) next.add(source.id);
      }
      return next;
    });
  }, [scopedReadModel.sources]);

  // Composer config derived from context.
  const composerLockedLinks = useMemo<ShareTarget[]>(() => {
    if (context.kind === "team") {
      return [{ id: context.teamId, type: "team", label: context.teamLabel ?? "This team" }];
    }
    return [];
  }, [context]);

  const composerAllowedTypes = useMemo<readonly CalendarEntryTypeOption[] | undefined>(() => {
    if (context.kind === "team" || context.kind === "facility") return ["practice"] as const;
    return undefined;
  }, [context]);

  const composerDefaultType = useMemo<CalendarEntryTypeOption | undefined>(() => {
    if (context.kind === "team" || context.kind === "facility") return "practice";
    return undefined;
  }, [context]);

  const composerCreatedViaTag = useMemo(() => {
    if (context.kind === "team") return "team_workspace";
    if (context.kind === "facility") return "facility_workspace";
    return "manage_calendar";
  }, [context]);

  const composer = useCalendarEntryComposer({
    orgSlug,
    canWrite,
    readModel,
    setReadModel,
    facilityReadModel,
    refreshWorkspace,
    onSelectedOccurrenceChange: setSelectedOccurrenceId,
    removeOptimistic,
    createdViaTag: composerCreatedViaTag,
    lockedLinks: composerLockedLinks,
    allowedEntryTypes: composerAllowedTypes,
    defaultEntryType: composerDefaultType,
    facilityRootId,
    defaultFacilityId: context.kind === "facility" ? context.spaceId : null
  });

  function submitEditComposer() {
    if (!selectedOccurrence || !selectedEntry) return;

    const nextStartsAtUtc = localInputToUtcIso(editStartsAtLocal);
    const nextEndsAtUtc = localInputToUtcIso(editEndsAtLocal);
    const nextTitle = editTitle.trim();
    if (!nextStartsAtUtc || !nextEndsAtUtc || new Date(nextEndsAtUtc).getTime() <= new Date(nextStartsAtUtc).getTime()) {
      toast({ title: "Invalid time range", description: "End time must be after start time.", variant: "destructive" });
      return;
    }
    if (!nextTitle) {
      toast({ title: "Title required", description: "Add a title before saving.", variant: "destructive" });
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
            configJson: { specificDates: ruleDraft.specificDates }
          },
          copyForwardInvites: true,
          copyForwardFacilities: true
        });

        if (!recurringResult.ok) {
          toast({ title: "Unable to update recurring event", description: recurringResult.error, variant: "destructive" });
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
        toast({ title: "Unable to update event", description: entryUpdate.error, variant: "destructive" });
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
        toast({ title: "Unable to update timing", description: occurrenceUpdate.error, variant: "destructive" });
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

    if (!selectedOccurrence || !selectedEntry) return;

    const nextMetadata = {
      ...selectedOccurrence.metadataJson,
      sharing: { permission: scopedPermission, targets: scopedTargets, updatedAt: new Date().toISOString() }
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
        if (alreadyInvited) continue;
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
        toast({ title: "Unable to update sharing", description: updateResult.error, variant: "destructive" });
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
    if (!occurrence || !occurrence.sourceRuleId) return;
    const entry = findEntryForOccurrence(readModel, occurrence);
    const rule = readModel.rules.find((item) => item.id === occurrence.sourceRuleId) ?? null;
    if (!entry || !rule) return;

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
        configJson: { specificDates: ruleShape.specificDates }
      },
      copyForwardInvites: true,
      copyForwardFacilities: true
    });
    if (!result.ok) {
      toast({ title: "Unable to update recurring event", description: result.error, variant: "destructive" });
      refreshWorkspace();
      return;
    }
    refreshWorkspace("Recurring event updated");
  }

  function moveOccurrence(itemId: string, startsAtUtc: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) return;

    const startParts = toLocalParts(startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
    const now = new Date().toISOString();

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((item) =>
        item.id === occurrence.id
          ? { ...item, startsAtUtc, endsAtUtc, localDate: startParts.localDate, localStartTime: startParts.localTime, localEndTime: endParts.localTime, updatedAt: now }
          : item
      ),
      allocations: current.allocations.map((allocation) =>
        allocation.occurrenceId === occurrence.id ? { ...allocation, startsAtUtc, endsAtUtc, updatedAt: now } : allocation
      )
    }));

    if (isOptimisticId(occurrence.id)) {
      composer.recordPendingMove(occurrence.id, { startsAtUtc, endsAtUtc, timezone: occurrence.timezone });
      return;
    }

    if (occurrence.sourceRuleId) {
      setPendingRecurringMutation({ type: "move", occurrenceId: occurrence.id, startsAtUtc, endsAtUtc });
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
        metadataJson: { ...occurrence.metadataJson, movedAt: new Date().toISOString() }
      });
      if (!result.ok) {
        toast({ title: "Unable to move occurrence", description: result.error, variant: "destructive" });
        refreshWorkspace();
        return;
      }
      refreshWorkspace("Occurrence moved");
    });
  }

  function resizeOccurrence(itemId: string, endsAtUtc: string) {
    const occurrence = findOccurrence(readModel, itemId);
    if (!occurrence) return;

    const startParts = toLocalParts(occurrence.startsAtUtc, occurrence.timezone);
    const endParts = toLocalParts(endsAtUtc, occurrence.timezone);
    const now = new Date().toISOString();

    setReadModel((current) => ({
      ...current,
      occurrences: current.occurrences.map((item) =>
        item.id === occurrence.id
          ? { ...item, endsAtUtc, localDate: startParts.localDate, localStartTime: startParts.localTime, localEndTime: endParts.localTime, updatedAt: now }
          : item
      ),
      allocations: current.allocations.map((allocation) =>
        allocation.occurrenceId === occurrence.id ? { ...allocation, endsAtUtc, updatedAt: now } : allocation
      )
    }));

    if (isOptimisticId(occurrence.id)) {
      composer.recordPendingMove(occurrence.id, { startsAtUtc: occurrence.startsAtUtc, endsAtUtc, timezone: occurrence.timezone });
      return;
    }

    if (occurrence.sourceRuleId) {
      setPendingRecurringMutation({ type: "resize", occurrenceId: occurrence.id, startsAtUtc: occurrence.startsAtUtc, endsAtUtc });
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
        metadataJson: { ...occurrence.metadataJson, resizedAt: new Date().toISOString() }
      });
      if (!result.ok) {
        toast({ title: "Unable to resize occurrence", description: result.error, variant: "destructive" });
        refreshWorkspace();
        return;
      }
      refreshWorkspace("Occurrence updated");
    });
  }

  function openEditFacilityDialog() {
    if (!selectedOccurrence) return;
    const selections: FacilityBookingSelection[] = selectedAllocations.map((allocation) => ({
      spaceId: allocation.spaceId,
      configurationId: allocation.configurationId,
      lockMode: allocation.lockMode,
      allowShared: allocation.allowShared,
      notes: typeof allocation.metadataJson?.notes === "string" ? (allocation.metadataJson.notes as string) : ""
    }));
    const firstSpaceId = selections[0]?.spaceId;
    const rootId = firstSpaceId ? resolveRootSpaceId(firstSpaceId, spaceById) ?? "" : "";
    setEditFacilityId(rootId);
    setEditFacilitySelections(selections);
    setEditFacilityDialogOpen(true);
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

  const editBookingWindows = useMemo<FacilityBookingWindow[]>(() => {
    if (!selectedOccurrence) return [];
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
  }, [activeRule, selectedOccurrence]);

  async function handleEditBookingSave() {
    if (!selectedOccurrence || !selectedEntry) {
      setEditFacilityDialogOpen(false);
      return;
    }

    const facility = editFacilityId ? facilityById.get(editFacilityId) ?? null : null;
    const locationValue = facility ? formatFacilityLocation(facility, editFacilitySpaces) || facility.name : "";

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
          allocations: editFacilitySelections
        });
        if (!allocationResult.ok) {
          toast({ title: "Unable to update facility booking", description: allocationResult.error, variant: "destructive" });
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
          toast({ title: "Unable to update location", description: entryUpdate.error, variant: "destructive" });
        }
        refreshWorkspace("Facility booking updated");
      });
    } else {
      setReadModel((current) => {
        const nextAllocations = editFacilitySelections.map((selection) => ({
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
          allocations: editFacilitySelections
        });
        if (!allocationResult.ok) {
          toast({ title: "Unable to update facility booking", description: allocationResult.error, variant: "destructive" });
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
          toast({ title: "Unable to update location", description: entryUpdate.error, variant: "destructive" });
        }
        refreshWorkspace("Facility booking updated");
      });
    }

    setEditFacilityDialogOpen(false);
  }

  // Chrome (title/description per context).
  const cardTitle =
    context.kind === "team"
      ? `${context.teamLabel ?? "Team"} Calendar`
      : context.kind === "facility"
      ? `${context.spaceName} Calendar`
      : "Calendar Workspace";

  const cardDescription =
    context.kind === "team"
      ? "Practices and shared sessions for this team."
      : context.kind === "facility"
      ? "Reservations and shared sessions in this facility."
      : "Events, practices, and games with drag-create, drag-move, and resize actions.";

  const editMode = Boolean(selectedOccurrence && selectedEntry);
  const inviteOnlyShare = selectedEntry?.entryType === "practice";
  const visibleShareTargets = inviteOnlyShare ? shareTargets.filter((target) => target.type === "team") : shareTargets;
  const eventPanelSubtitle =
    selectedOccurrence && selectedEntry
      ? `${selectedEntry.entryType} · ${new Date(selectedOccurrence.startsAtUtc).toLocaleString()}`
      : "Event details";

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <Calendar
        canEdit={canWrite}
        disableHoverGhost={Boolean(selectedOccurrenceId) || composer.isOpen || editFacilityDialogOpen}
        framed={false}
        quickAddUx="external"
        referenceTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        className="min-h-0 flex-1 overflow-hidden px-5 pb-5 md:px-6 md:pb-6"
        controlsSlot={
          <CalendarSourceFilterPopover onChange={setSelectedSourceIds} selectedSourceIds={selectedSourceIds} sources={scopedReadModel.sources} />
        }
        getConflictMessage={(draft) => {
          const hasOverlap = calendarItems.some((item) => {
            const start = new Date(item.startsAtUtc).getTime();
            const end = new Date(item.endsAtUtc).getTime();
            const newStart = new Date(draft.startsAtUtc).getTime();
            const newEnd = new Date(draft.endsAtUtc).getTime();
            return newStart < end && newEnd > start;
          });
          if (hasOverlap) return "This time overlaps an existing item.";
          return null;
        }}
        items={calendarItems}
        onCreateRange={(range) =>
          composer.open({
            title: context.kind === "team" ? "Team practice" : context.kind === "facility" ? `${context.spaceName} practice` : "New event",
            startsAtUtc: range.startsAtUtc,
            endsAtUtc: range.endsAtUtc
          })
        }
        onMoveItem={(input) => moveOccurrence(input.itemId, input.startsAtUtc, input.endsAtUtc)}
        onCancelCreate={composer.close}
        onQuickAddIntent={composer.open}
        onResizeItem={(input) => resizeOccurrence(input.itemId, input.endsAtUtc)}
        onSelectItem={(occurrenceId) => {
          const occurrence = findOccurrence(readModel, occurrenceId);
          if (!occurrence) return;
          const entry = findEntryForOccurrence(readModel, occurrence);
          if (!entry) return;
          composer.openForEdit({ occurrence, entry });
        }}
      />
      {composer.element}
      <Panel
        footer={
          <>
            <Button onClick={() => setPendingRecurringMutation(null)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!pendingRecurringMutation) return;
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
                      toast({ title: "Unable to delete recurring occurrence", description: result.error, variant: "destructive" });
                      refreshWorkspace();
                      return;
                    }
                    refreshWorkspace("Recurring occurrence deleted");
                    return;
                  }
                  if (!mutation.startsAtUtc || !mutation.endsAtUtc) return;
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
