"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus2, Pencil, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { AddressAutocompleteInput } from "@/components/ui/address-autocomplete-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { PublishStatusIcon } from "@/components/ui/publish-status-icon";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createEventAction, deleteEventAction, updateEventAction } from "@/modules/events/actions";
import type { OrgEvent } from "@/modules/events/types";

type EventsManagePanelProps = {
  orgSlug: string;
  events: OrgEvent[];
  canWrite?: boolean;
};

type DraftState = {
  title: string;
  summary: string;
  location: string;
  timezone: string;
  status: "draft" | "published" | "archived";
  isAllDay: boolean;
  allDayStartDate: string;
  allDayEndDate: string;
  startsAtLocal: string;
  endsAtLocal: string;
};

function asLocalDateTimeInput(isoUtc: string) {
  const date = new Date(isoUtc);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoFromLocalDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function formatEventRange(event: OrgEvent) {
  if (event.isAllDay && event.allDayStartDate && event.allDayEndDate) {
    if (event.allDayStartDate === event.allDayEndDate) {
      return `${event.allDayStartDate} (All day)`;
    }

    return `${event.allDayStartDate} to ${event.allDayEndDate} (All day)`;
  }

  const start = new Date(event.startsAtUtc);
  const end = new Date(event.endsAtUtc);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time unavailable";
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(start);

  const endDateLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(end);

  const startTime = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    hour: "numeric",
    minute: "2-digit"
  }).format(start);

  const endTime = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    hour: "numeric",
    minute: "2-digit"
  }).format(end);

  const sameDay = dateLabel === endDateLabel;

  if (sameDay) {
    return `${dateLabel} · ${startTime} to ${endTime}`;
  }

  return `${dateLabel} ${startTime} to ${endDateLabel} ${endTime}`;
}

function defaultDraft(timezone: string): DraftState {
  return {
    title: "",
    summary: "",
    location: "",
    timezone,
    status: "draft",
    isAllDay: false,
    allDayStartDate: "",
    allDayEndDate: "",
    startsAtLocal: "",
    endsAtLocal: ""
  };
}

function draftFromEvent(event: OrgEvent): DraftState {
  return {
    title: event.title,
    summary: event.summary ?? "",
    location: event.location ?? "",
    timezone: event.timezone,
    status: event.status,
    isAllDay: event.isAllDay,
    allDayStartDate: event.allDayStartDate ?? "",
    allDayEndDate: event.allDayEndDate ?? "",
    startsAtLocal: event.isAllDay ? "" : asLocalDateTimeInput(event.startsAtUtc),
    endsAtLocal: event.isAllDay ? "" : asLocalDateTimeInput(event.endsAtUtc)
  };
}

function statusToggleTarget(status: OrgEvent["status"]): "draft" | "published" {
  if (status === "published") {
    return "draft";
  }

  return "published";
}

export function EventsManagePanel({ orgSlug, events, canWrite = true }: EventsManagePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => defaultDraft(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const [statusEventId, setStatusEventId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isTogglingStatus, startTogglingStatus] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.startsAtUtc !== b.startsAtUtc) {
        return a.startsAtUtc.localeCompare(b.startsAtUtc);
      }

      return a.title.localeCompare(b.title);
    });
  }, [events]);

  const editingEvent = useMemo(() => {
    if (!editingEventId) {
      return null;
    }

    return events.find((event) => event.id === editingEventId) ?? null;
  }, [editingEventId, events]);

  function closePanel() {
    setPanelOpen(false);
    setEditingEventId(null);
    setDraft(defaultDraft(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  }

  function openCreatePanel() {
    setEditingEventId(null);
    setDraft(defaultDraft(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
    setPanelOpen(true);
  }

  function openEditPanel(event: OrgEvent) {
    setEditingEventId(event.id);
    setDraft(draftFromEvent(event));
    setPanelOpen(true);
  }

  function refreshWithToast(title: string) {
    toast({
      title,
      variant: "success"
    });
    router.refresh();
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite) {
      return;
    }

    if (draft.title.trim().length < 2) {
      toast({
        title: "Title required",
        description: "Please provide an event title.",
        variant: "destructive"
      });
      return;
    }

    startSaving(async () => {
      const payloadBase = {
        orgSlug,
        title: draft.title.trim(),
        summary: draft.summary,
        location: draft.location,
        timezone: draft.timezone,
        status: draft.status,
        isAllDay: draft.isAllDay
      } as const;

      const payload = draft.isAllDay
        ? {
            ...payloadBase,
            allDayStartDate: draft.allDayStartDate,
            allDayEndDate: draft.allDayEndDate
          }
        : (() => {
            const startsAtUtc = toIsoFromLocalDateTime(draft.startsAtLocal);
            const endsAtUtc = toIsoFromLocalDateTime(draft.endsAtLocal);

            if (!startsAtUtc || !endsAtUtc) {
              return null;
            }

            return {
              ...payloadBase,
              startsAtUtc,
              endsAtUtc
            };
          })();

      if (!payload) {
        toast({
          title: "Invalid time window",
          description: "Please provide valid start and end times.",
          variant: "destructive"
        });
        return;
      }

      const result = editingEventId ? await updateEventAction({ ...payload, eventId: editingEventId }) : await createEventAction(payload);

      if (!result.ok) {
        toast({
          title: editingEventId ? "Unable to update event" : "Unable to create event",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      closePanel();
      refreshWithToast(editingEventId ? "Event updated" : "Event created");
    });
  }

  function handleToggleStatus(event: OrgEvent) {
    if (!canWrite) {
      return;
    }

    const nextStatus = statusToggleTarget(event.status);
    setStatusEventId(event.id);

    startTogglingStatus(async () => {
      const result = await updateEventAction({
        orgSlug,
        eventId: event.id,
        title: event.title,
        summary: event.summary ?? "",
        location: event.location ?? "",
        timezone: event.timezone,
        status: nextStatus,
        isAllDay: event.isAllDay,
        allDayStartDate: event.allDayStartDate ?? undefined,
        allDayEndDate: event.allDayEndDate ?? undefined,
        startsAtUtc: event.isAllDay ? undefined : event.startsAtUtc,
        endsAtUtc: event.isAllDay ? undefined : event.endsAtUtc
      });

      setStatusEventId(null);

      if (!result.ok) {
        toast({
          title: "Unable to update event status",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refreshWithToast(nextStatus === "published" ? "Event published" : "Event unpublished");
    });
  }

  function handleDeleteEvent() {
    if (!canWrite || !editingEventId) {
      return;
    }

    startDeleting(async () => {
      const result = await deleteEventAction({
        orgSlug,
        eventId: editingEventId
      });

      if (!result.ok) {
        toast({
          title: "Unable to delete event",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      closePanel();
      refreshWithToast("Event deleted");
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Events</CardTitle>
            <Button disabled={!canWrite} onClick={openCreatePanel} type="button">
              <CalendarPlus2 className="h-4 w-4" />
              Create event
            </Button>
          </div>
          <CardDescription>Publish events to power the Events block list and calendar views.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedEvents.length === 0 ? <Alert variant="info">No events yet.</Alert> : null}
          {sortedEvents.map((eventItem) => (
            <div className="rounded-control border bg-surface px-3 py-3" key={eventItem.id}>
              <div className="flex items-start gap-2">
                <PublishStatusIcon
                  disabled={!canWrite}
                  isLoading={isTogglingStatus && statusEventId === eventItem.id}
                  isPublished={eventItem.status === "published"}
                  onToggle={() => handleToggleStatus(eventItem)}
                  statusLabel={`${eventItem.status} status for ${eventItem.title}`}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text">{eventItem.title}</p>
                  <p className="text-xs text-text-muted">
                    {formatEventRange(eventItem)} · {eventItem.status}
                  </p>
                  {eventItem.location ? <p className="mt-1 text-xs text-text-muted">{eventItem.location}</p> : null}
                  {eventItem.summary ? <p className="mt-1 text-sm text-text-muted">{eventItem.summary}</p> : null}
                </div>

                <Button onClick={() => openEditPanel(eventItem)} size="sm" variant="secondary">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Panel
        footer={
          <>
            {editingEventId ? (
              <Button disabled={!canWrite || isSaving || isDeleting} loading={isDeleting} onClick={handleDeleteEvent} variant="destructive">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
            <Button onClick={closePanel} variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canWrite || isDeleting} form="events-manage-form" loading={isSaving} type="submit">
              {editingEventId ? "Save event" : "Create event"}
            </Button>
          </>
        }
        onClose={closePanel}
        open={panelOpen}
        subtitle={editingEvent ? "Update event details and visibility." : "Create an event for list and calendar blocks."}
        title={editingEvent ? "Edit event" : "Create event"}
      >
        <form className="space-y-4" id="events-manage-form" onSubmit={handleSave}>
          <FormField label="Title">
            <Input
              disabled={!canWrite}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              required
              value={draft.title}
            />
          </FormField>

          <FormField label="Summary">
            <Textarea
              className="min-h-[90px]"
              disabled={!canWrite}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              value={draft.summary}
            />
          </FormField>

          <FormField label="Location">
            <AddressAutocompleteInput
              disabled={!canWrite}
              onChange={(nextValue) => setDraft((current) => ({ ...current, location: nextValue }))}
              value={draft.location}
            />
          </FormField>

          <FormField label="Timezone">
            <Input
              disabled={!canWrite}
              onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
              placeholder="America/Detroit"
              value={draft.timezone}
            />
          </FormField>

          <FormField label="Status">
            <Select
              disabled={!canWrite}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as DraftState["status"]
                }));
              }}
              options={[
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" }
              ]}
              value={draft.status}
            />
          </FormField>

          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
            <Checkbox
              checked={draft.isAllDay}
              disabled={!canWrite}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  isAllDay: event.target.checked
                }))
              }
            />
            All-day event
          </label>

          {draft.isAllDay ? (
            <>
              <FormField label="Start date">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setDraft((current) => ({ ...current, allDayStartDate: event.target.value }))}
                  required
                  type="date"
                  value={draft.allDayStartDate}
                />
              </FormField>

              <FormField label="End date">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setDraft((current) => ({ ...current, allDayEndDate: event.target.value }))}
                  required
                  type="date"
                  value={draft.allDayEndDate}
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="Start time">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setDraft((current) => ({ ...current, startsAtLocal: event.target.value }))}
                  required
                  type="datetime-local"
                  value={draft.startsAtLocal}
                />
              </FormField>

              <FormField label="End time">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setDraft((current) => ({ ...current, endsAtLocal: event.target.value }))}
                  required
                  type="datetime-local"
                  value={draft.endsAtLocal}
                />
              </FormField>
            </>
          )}
        </form>
      </Panel>
    </div>
  );
}
