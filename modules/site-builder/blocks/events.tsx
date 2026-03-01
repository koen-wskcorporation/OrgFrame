import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ButtonListEditor } from "@/components/editor/buttons/ButtonListEditor";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defaultInternalHref, resolveButtonHref } from "@/lib/links";
import { asBody, asButtons, asNumber, asObject, asText } from "@/modules/site-builder/blocks/helpers";
import { EventsCalendarClient } from "@/modules/site-builder/blocks/events-calendar.client";
import type { BlockContext, BlockEditorProps, BlockRenderProps, EventsBlockConfig } from "@/modules/site-builder/types";
import type { EventCatalogItem } from "@/modules/events/types";

function defaultEventsConfig(_: BlockContext): EventsBlockConfig {
  return {
    title: "Events",
    body: "Share upcoming organization events in list or calendar format.",
    style: "list",
    maxItems: 12,
    showPastEvents: false,
    calendarDefaultView: "month",
    emptyMessage: "No events are scheduled right now.",
    buttons: [
      {
        id: "events-contact",
        label: "Contact us",
        href: defaultInternalHref("home"),
        variant: "secondary"
      }
    ]
  };
}

export function createDefaultEventsConfig(context: BlockContext) {
  return defaultEventsConfig(context);
}

function asStyle(value: unknown, fallback: EventsBlockConfig["style"]): EventsBlockConfig["style"] {
  return value === "calendar" ? "calendar" : fallback;
}

function asCalendarView(value: unknown, fallback: EventsBlockConfig["calendarDefaultView"]): EventsBlockConfig["calendarDefaultView"] {
  if (value === "week" || value === "day" || value === "month") {
    return value;
  }

  return fallback;
}

export function sanitizeEventsConfig(config: unknown, context: BlockContext): EventsBlockConfig {
  const fallback = defaultEventsConfig(context);
  const value = asObject(config);

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 500),
    style: asStyle(value.style, fallback.style),
    maxItems: asNumber(value.maxItems, fallback.maxItems, 1, 100),
    showPastEvents: typeof value.showPastEvents === "boolean" ? value.showPastEvents : fallback.showPastEvents,
    calendarDefaultView: asCalendarView(value.calendarDefaultView, fallback.calendarDefaultView),
    emptyMessage: asBody(value.emptyMessage, fallback.emptyMessage, 160),
    buttons: asButtons(value.buttons, fallback.buttons, { max: 3 })
  };
}

function parseIsoDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return parsed;
}

function isPastEvent(event: EventCatalogItem, now: Date) {
  if (event.isAllDay && event.allDayEndDate) {
    const endDate = parseIsoDate(event.allDayEndDate);

    if (!endDate) {
      return false;
    }

    const endOfDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1, 0, 0, 0, 0);
    return endOfDay.getTime() <= now.getTime();
  }

  const endUtc = new Date(event.endsAtUtc);

  if (Number.isNaN(endUtc.getTime())) {
    return false;
  }

  return endUtc.getTime() <= now.getTime();
}

function sortEvents(events: EventCatalogItem[]) {
  return [...events].sort((a, b) => {
    const left = new Date(a.startsAtUtc);
    const right = new Date(b.startsAtUtc);

    if (!Number.isNaN(left.getTime()) && !Number.isNaN(right.getTime()) && left.getTime() !== right.getTime()) {
      return left.getTime() - right.getTime();
    }

    if (a.allDayStartDate && b.allDayStartDate && a.allDayStartDate !== b.allDayStartDate) {
      return a.allDayStartDate.localeCompare(b.allDayStartDate);
    }

    return a.title.localeCompare(b.title);
  });
}

function formatEventRange(event: EventCatalogItem) {
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

  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

export function EventsBlockRender({ block, context, runtimeData }: BlockRenderProps<"events">) {
  const now = new Date();
  const sourceEvents = sortEvents(runtimeData.eventsCatalogItems ?? []);
  const events = block.config.showPastEvents ? sourceEvents : sourceEvents.filter((event) => !isPastEvent(event, now));

  return (
    <section id="events">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{block.config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>

          {block.config.style === "calendar" ? (
            <EventsCalendarClient
              emptyMessage={block.config.emptyMessage}
              events={events}
              initialView={block.config.calendarDefaultView}
              orgSlug={context.orgSlug}
            />
          ) : events.length === 0 ? (
            <Alert variant="info">{block.config.emptyMessage}</Alert>
          ) : (
            <div className="space-y-3">
              {events.slice(0, block.config.maxItems).map((eventItem) => (
                <article className="rounded-control border bg-surface px-3 py-3" key={eventItem.id}>
                  <h3 className="font-semibold text-text">
                    <Link className="hover:underline" href={`/${context.orgSlug}/events/${eventItem.id}`}>
                      {eventItem.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-text-muted">{formatEventRange(eventItem)}</p>
                  {eventItem.location ? <p className="mt-1 text-xs text-text-muted">{eventItem.location}</p> : null}
                  {eventItem.summary ? <p className="mt-2 text-sm text-text-muted">{eventItem.summary}</p> : null}
                </article>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {block.config.buttons.map((button) => (
              <a
                className={buttonVariants({ variant: button.variant })}
                href={resolveButtonHref(context.orgSlug, button.href)}
                key={button.id}
                rel={button.newTab ? "noreferrer" : undefined}
                target={button.newTab ? "_blank" : undefined}
              >
                {button.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function EventsBlockEditor({ block, onChange, context }: BlockEditorProps<"events">) {
  function updateConfig(patch: Partial<EventsBlockConfig>) {
    onChange({
      ...block,
      config: {
        ...block.config,
        ...patch
      }
    });
  }

  return (
    <div className="space-y-4">
      <FormField label="Title">
        <Input
          onChange={(event) => {
            updateConfig({ title: event.target.value });
          }}
          value={block.config.title}
        />
      </FormField>

      <FormField label="Body">
        <Textarea
          className="min-h-[90px]"
          onChange={(event) => {
            updateConfig({ body: event.target.value });
          }}
          value={block.config.body}
        />
      </FormField>

      <FormField label="Display style">
        <Select
          onChange={(event) => {
            updateConfig({
              style: event.target.value === "calendar" ? "calendar" : "list"
            });
          }}
          options={[
            {
              value: "list",
              label: "Vertical list"
            },
            {
              value: "calendar",
              label: "Calendar"
            }
          ]}
          value={block.config.style}
        />
      </FormField>

      <FormField label="Empty state message">
        <Input
          onChange={(event) => {
            updateConfig({ emptyMessage: event.target.value });
          }}
          value={block.config.emptyMessage}
        />
      </FormField>

      <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
        <Checkbox
          checked={block.config.showPastEvents}
          onChange={(event) => {
            updateConfig({ showPastEvents: event.target.checked });
          }}
        />
        Include past events
      </label>

      {block.config.style === "list" ? (
        <FormField label="Max list items">
          <Input
            min={1}
            onChange={(event) => {
              updateConfig({
                maxItems: asNumber(event.target.value, block.config.maxItems, 1, 100)
              });
            }}
            step={1}
            type="number"
            value={String(block.config.maxItems)}
          />
        </FormField>
      ) : (
        <FormField label="Calendar default view">
          <Select
            onChange={(event) => {
              updateConfig({
                calendarDefaultView:
                  event.target.value === "week" || event.target.value === "day" ? event.target.value : "month"
              });
            }}
            options={[
              {
                value: "month",
                label: "Month"
              },
              {
                value: "week",
                label: "Week"
              },
              {
                value: "day",
                label: "Day"
              }
            ]}
            value={block.config.calendarDefaultView}
          />
        </FormField>
      )}

      <ButtonListEditor
        maxButtons={3}
        onChange={(buttons) => {
          updateConfig({ buttons });
        }}
        orgSlug={context.orgSlug}
        value={block.config.buttons}
      />
    </div>
  );
}
