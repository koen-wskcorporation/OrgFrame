import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { asBody, asObject, asText } from "@/src/features/site/blocks/helpers";
import type {
  BlockContext,
  BlockEditorProps,
  BlockRenderProps,
  FacilityAvailabilityCalendarBlockConfig
} from "@/src/features/site/types";
import { FacilityStatusBadge } from "@/src/features/facilities/components/FacilityStatusBadge";

function defaultFacilityAvailabilityCalendarConfig(_: BlockContext): FacilityAvailabilityCalendarBlockConfig {
  return {
    title: "Facility Availability",
    body: "Share open and reserved windows for rooms, fields, and courts.",
    defaultView: "month",
    showPendingReservations: true,
    emptyMessage: "No upcoming facility reservations."
  };
}

export function createDefaultFacilityAvailabilityCalendarConfig(context: BlockContext) {
  return defaultFacilityAvailabilityCalendarConfig(context);
}

function asDefaultView(value: unknown, fallback: FacilityAvailabilityCalendarBlockConfig["defaultView"]): FacilityAvailabilityCalendarBlockConfig["defaultView"] {
  if (value === "week" || value === "day" || value === "month") {
    return value;
  }

  return fallback;
}

export function sanitizeFacilityAvailabilityCalendarConfig(
  config: unknown,
  context: BlockContext
): FacilityAvailabilityCalendarBlockConfig {
  const fallback = defaultFacilityAvailabilityCalendarConfig(context);
  const value = asObject(config);

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 500),
    defaultView: asDefaultView(value.defaultView, fallback.defaultView),
    showPendingReservations: typeof value.showPendingReservations === "boolean" ? value.showPendingReservations : fallback.showPendingReservations,
    emptyMessage: asBody(value.emptyMessage, fallback.emptyMessage, 160)
  };
}

function getWindowEnd(now: Date, view: FacilityAvailabilityCalendarBlockConfig["defaultView"]) {
  const dayMs = 24 * 60 * 60 * 1000;
  if (view === "day") {
    return new Date(now.getTime() + dayMs);
  }

  if (view === "week") {
    return new Date(now.getTime() + 7 * dayMs);
  }

  return new Date(now.getTime() + 31 * dayMs);
}

function getReservationDateKey(startsAtUtc: string, timezone: string) {
  const date = new Date(startsAtUtc);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function FacilityAvailabilityCalendarBlockRender({
  block,
  runtimeData,
  isEditing,
  onChange
}: BlockRenderProps<"facility_availability_calendar">) {
  const snapshot = runtimeData.facilityAvailability;
  const canInlineEdit = isEditing && Boolean(onChange);

  if (!snapshot) {
    return (
      <section id="facility-availability-calendar">
        <Alert variant="info">{block.config.emptyMessage}</Alert>
      </section>
    );
  }

  const now = new Date();
  const windowEnd = getWindowEnd(now, block.config.defaultView);
  const reservations = snapshot.reservations
    .filter((reservation) => (block.config.showPendingReservations ? true : reservation.status === "approved"))
    .filter((reservation) => {
      const startsAt = new Date(reservation.startsAtUtc);
      return startsAt.getTime() >= now.getTime() && startsAt.getTime() <= windowEnd.getTime();
    })
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  const grouped = reservations.reduce<Record<string, typeof reservations>>((draft, reservation) => {
    const key = getReservationDateKey(reservation.startsAtUtc, reservation.timezone) ?? "Unknown date";
    const current = draft[key] ?? [];
    current.push(reservation);
    draft[key] = current;
    return draft;
  }, {});

  const sortedKeys = Object.keys(grouped).sort();

  return (
    <section id="facility-availability-calendar">
      <Card>
        <CardHeader>
          {canInlineEdit ? (
            <InlineText
              as="h3"
              className="text-2xl font-semibold leading-tight tracking-tight text-text"
              maxLength={120}
              onCommit={(next) => onChange?.({ ...block, config: { ...block.config, title: next } })}
              placeholder="Title"
              value={block.config.title}
            />
          ) : (
            <CardTitle className="text-2xl">{block.config.title}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {canInlineEdit ? (
            <InlineText
              multiline
              className="text-sm text-text-muted md:text-base"
              maxLength={500}
              onCommit={(next) => onChange?.({ ...block, config: { ...block.config, body: next } })}
              placeholder="Body"
              value={block.config.body}
            />
          ) : (
            <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>
          )}

          {sortedKeys.length === 0 ? <Alert variant="info">{block.config.emptyMessage}</Alert> : null}
          <div className="space-y-4">
            {sortedKeys.map((dateKey) => (
              <article className="rounded-control border bg-surface px-3 py-3" key={dateKey}>
                <h3 className="font-semibold text-text">{dateKey}</h3>
                <div className="mt-2 space-y-2">
                  {grouped[dateKey]?.map((reservation) => {
                    const space = snapshot.spaces.find((item) => item.id === reservation.spaceId);
                    const startsAt = new Date(reservation.startsAtUtc);
                    const endsAt = new Date(reservation.endsAtUtc);
                    const formatter = new Intl.DateTimeFormat(undefined, {
                      timeZone: reservation.timezone,
                      hour: "numeric",
                      minute: "2-digit"
                    });

                    return (
                      <div className="rounded-control border bg-surface-muted px-2 py-2 text-sm" key={reservation.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-text">{reservation.publicLabel || space?.name || "Reserved"}</p>
                          <FacilityStatusBadge status={reservation.status} />
                          <span className="text-xs text-text-muted">{reservation.reservationKind}</span>
                        </div>
                        <p className="text-xs text-text-muted">
                          {Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())
                            ? "Time unavailable"
                            : `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`}
                          {space ? ` · ${space.name}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function FacilityAvailabilityCalendarBlockEditor({
  block,
  onChange
}: BlockEditorProps<"facility_availability_calendar">) {
  function updateConfig(patch: Partial<FacilityAvailabilityCalendarBlockConfig>) {
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
      <FormField label="Default calendar window">
        <Select
          onChange={(event) =>
            updateConfig({
              defaultView: event.target.value === "week" || event.target.value === "day" ? event.target.value : "month"
            })
          }
          options={[
            { value: "month", label: "Month (31 days)" },
            { value: "week", label: "Week (7 days)" },
            { value: "day", label: "Day (24 hours)" }
          ]}
          value={block.config.defaultView}
        />
      </FormField>

      <label className="ui-inline-toggle">
        <Checkbox
          checked={block.config.showPendingReservations}
          onChange={(event) => updateConfig({ showPendingReservations: event.target.checked })}
        />
        Include pending reservations
      </label>

      <FormField label="Empty state message">
        <Input onChange={(event) => updateConfig({ emptyMessage: event.target.value })} value={block.config.emptyMessage} />
      </FormField>
    </div>
  );
}
