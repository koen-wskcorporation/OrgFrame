"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Input } from "@orgframe/ui/primitives/input";
import { Plus, Trash2 } from "lucide-react";
import type { WidgetType } from "@/src/features/manage-dashboard/types";

type RenderProps = {
  orgSlug: string;
  settings?: Record<string, unknown>;
  data: { ok: true; data: unknown } | { ok: false; error: string; message?: string };
  onUpdateSettings?: (next: Record<string, unknown>) => void;
};

function Missing({ error }: { error: string }) {
  if (error === "PERMISSION_DENIED") {
    return <Alert variant="warning">You don't have permission to view this data.</Alert>;
  }
  return <Alert variant="destructive">Unable to load widget.</Alert>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ui-muted-block flex flex-col gap-1">
      <span className="ui-kv-label">{label}</span>
      <span className="text-2xl font-semibold leading-none text-text">{value}</span>
    </div>
  );
}

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

type FormsSettings = { showForms?: boolean; showSubmissions?: boolean; showStatuses?: boolean };

function FormsSummaryWidget({ data, orgSlug, settings }: RenderProps) {
  if (!data.ok) return <Missing error={data.error} />;
  if (!data.data) return <p className="text-sm text-text-muted">Loading…</p>;
  const f = data.data as { draft: number; published: number; archived: number; totalForms: number; totalSubmissions: number };
  const s = (settings ?? {}) as FormsSettings;
  const showForms = s.showForms ?? true;
  const showSubmissions = s.showSubmissions ?? true;
  const showStatuses = s.showStatuses ?? true;
  return (
    <div className="flex flex-col gap-3">
      {showForms || showSubmissions ? (
        <div className="grid grid-cols-2 gap-2">
          {showForms ? <Metric label="Forms" value={f.totalForms} /> : null}
          {showSubmissions ? <Metric label="Submissions" value={f.totalSubmissions} /> : null}
        </div>
      ) : null}
      {showStatuses ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Published {f.published}</Badge>
          <Badge variant="neutral">Draft {f.draft}</Badge>
          <Badge variant="neutral">Archived {f.archived}</Badge>
        </div>
      ) : null}
      <div>
        <Button href={`/${orgSlug}/manage/forms`} size="sm" variant="secondary">
          Open Forms
        </Button>
      </div>
    </div>
  );
}

function FormsSummarySettings({ settings, onUpdateSettings }: RenderProps) {
  const s = (settings ?? {}) as FormsSettings;
  const showForms = s.showForms ?? true;
  const showSubmissions = s.showSubmissions ?? true;
  const showStatuses = s.showStatuses ?? true;
  const update = (patch: Partial<FormsSettings>) => onUpdateSettings?.({ ...s, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <SettingToggle checked={showForms} label="Forms total" onChange={(v) => update({ showForms: v })} />
      <SettingToggle checked={showSubmissions} label="Submissions total" onChange={(v) => update({ showSubmissions: v })} />
      <SettingToggle checked={showStatuses} label="Status breakdown" onChange={(v) => update({ showStatuses: v })} />
    </div>
  );
}

type ProgramsSettings = { showTotal?: boolean; showStatuses?: boolean };

function ProgramsSummaryWidget({ data, orgSlug, settings }: RenderProps) {
  if (!data.ok) return <Missing error={data.error} />;
  if (!data.data) return <p className="text-sm text-text-muted">Loading…</p>;
  const p = data.data as { draft: number; published: number; archived: number; totalPrograms: number };
  const s = (settings ?? {}) as ProgramsSettings;
  const showTotal = s.showTotal ?? true;
  const showStatuses = s.showStatuses ?? true;
  return (
    <div className="flex flex-col gap-3">
      {showTotal ? <Metric label="Programs" value={p.totalPrograms} /> : null}
      {showStatuses ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Published {p.published}</Badge>
          <Badge variant="neutral">Draft {p.draft}</Badge>
          <Badge variant="neutral">Archived {p.archived}</Badge>
        </div>
      ) : null}
      <div>
        <Button href={`/${orgSlug}/manage/programs`} size="sm" variant="secondary">
          Open Programs
        </Button>
      </div>
    </div>
  );
}

function ProgramsSummarySettings({ settings, onUpdateSettings }: RenderProps) {
  const s = (settings ?? {}) as ProgramsSettings;
  const showTotal = s.showTotal ?? true;
  const showStatuses = s.showStatuses ?? true;
  const update = (patch: Partial<ProgramsSettings>) => onUpdateSettings?.({ ...s, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <SettingToggle checked={showTotal} label="Programs total" onChange={(v) => update({ showTotal: v })} />
      <SettingToggle checked={showStatuses} label="Status breakdown" onChange={(v) => update({ showStatuses: v })} />
    </div>
  );
}

type EventsSettings = { showTotal?: boolean; showUpcoming?: boolean };

function EventsSummaryWidget({ data, orgSlug, settings }: RenderProps) {
  if (!data.ok) return <Missing error={data.error} />;
  if (!data.data) return <p className="text-sm text-text-muted">Loading…</p>;
  const e = data.data as { totalCalendarItems: number; upcoming: Array<{ id: string; title: string; startsAt: string }> };
  const s = (settings ?? {}) as EventsSettings;
  const showTotal = s.showTotal ?? true;
  const showUpcoming = s.showUpcoming ?? true;
  return (
    <div className="flex flex-col gap-3">
      {showTotal ? <Metric label="Calendar Items" value={e.totalCalendarItems} /> : null}
      {showUpcoming ? (
        e.upcoming.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {e.upcoming.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-text">{item.title}</span>
                <span className="text-xs text-text-muted">{item.startsAt ? new Date(item.startsAt).toLocaleDateString() : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No upcoming events.</p>
        )
      ) : null}
      <div>
        <Button href={`/${orgSlug}/manage/calendar`} size="sm" variant="secondary">
          Open Calendar
        </Button>
      </div>
    </div>
  );
}

function EventsSummarySettings({ settings, onUpdateSettings }: RenderProps) {
  const s = (settings ?? {}) as EventsSettings;
  const showTotal = s.showTotal ?? true;
  const showUpcoming = s.showUpcoming ?? true;
  const update = (patch: Partial<EventsSettings>) => onUpdateSettings?.({ ...s, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <SettingToggle checked={showTotal} label="Calendar items total" onChange={(v) => update({ showTotal: v })} />
      <SettingToggle checked={showUpcoming} label="Upcoming list" onChange={(v) => update({ showUpcoming: v })} />
    </div>
  );
}

function AiSummaryWidget({ orgSlug }: RenderProps) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setText("");
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          mode: "ask",
          phase: "plan",
          userMessage: "Give me a concise 3-bullet daily brief of this organization's status: forms, events, programs, and anything urgent. Use query_org_data with metric org_overview.",
          threadId: crypto.randomUUID(),
          turnId: crypto.randomUUID(),
          surface: "command",
          conversation: []
        })
      });
      if (!response.ok || !response.body) {
        setError("AI unavailable.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const block = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (block) {
            const lines = block.split("\n");
            let event = "";
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
            }
            if (event && dataLines.length > 0) {
              try {
                const payload = JSON.parse(dataLines.join("\n")) as { text?: string };
                if (event === "assistant.delta" && typeof payload.text === "string") {
                  streamed += payload.text;
                  setText(streamed);
                }
                if (event === "assistant.done" && typeof payload.text === "string") {
                  setText(payload.text);
                }
              } catch {}
            }
          }
          idx = buffer.indexOf("\n\n");
        }
      }
    } catch {
      setError("AI unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!text && !loading && !error) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {loading && !text ? <p className="text-sm text-text-muted">Generating brief…</p> : null}
      {text ? <p className="whitespace-pre-wrap text-sm text-text-strong">{text}</p> : null}
      <div>
        <Button onClick={() => void run()} disabled={loading} size="sm" type="button" variant="secondary">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
    </div>
  );
}

type QuickLink = { label: string; href: string };

function readQuickLinks(settings?: Record<string, unknown>): QuickLink[] {
  return Array.isArray(settings?.links) ? ((settings!.links as unknown[]).filter((l): l is QuickLink => {
    return !!l && typeof l === "object" && typeof (l as QuickLink).label === "string" && typeof (l as QuickLink).href === "string";
  })) : [];
}

function QuickLinksWidget({ settings }: RenderProps) {
  const links = readQuickLinks(settings);
  return (
    <div className="flex flex-col gap-3">
      {links.length === 0 ? (
        <p className="text-sm text-text-muted">No quick links yet. Use the settings icon to add some.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((link, i) => (
            <li key={`${link.href}-${i}`} className="text-sm">
              <Link className="truncate text-accent hover:underline" href={link.href}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickLinksSettings({ settings, onUpdateSettings }: RenderProps) {
  const links = readQuickLinks(settings);
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");

  const add = () => {
    if (!label.trim() || !href.trim() || !onUpdateSettings) return;
    onUpdateSettings({ ...(settings ?? {}), links: [...links, { label: label.trim(), href: href.trim() }] });
    setLabel("");
    setHref("");
  };

  const remove = (index: number) => {
    if (!onUpdateSettings) return;
    onUpdateSettings({ ...(settings ?? {}), links: links.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex flex-col gap-3">
      {links.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {links.map((link, i) => (
            <li key={`${link.href}-${i}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-text">{link.label}</span>
              <Button onClick={() => remove(i)} size="sm" type="button" variant="ghost">
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-2">
        <Input onChange={(e) => setLabel(e.target.value)} placeholder="Label" value={label} />
        <Input onChange={(e) => setHref(e.target.value)} placeholder="/path or https://..." value={href} />
        <Button onClick={add} size="sm" type="button" variant="primary">
          <Plus className="h-4 w-4" />
          Add Link
        </Button>
      </div>
    </div>
  );
}

export function renderWidget(type: WidgetType, props: RenderProps) {
  switch (type) {
    case "forms-summary":
      return <FormsSummaryWidget {...props} />;
    case "programs-summary":
      return <ProgramsSummaryWidget {...props} />;
    case "events-summary":
      return <EventsSummaryWidget {...props} />;
    case "ai-summary":
      return <AiSummaryWidget {...props} />;
    case "quick-links":
      return <QuickLinksWidget {...props} />;
    default:
      return null;
  }
}

export function renderWidgetSettings(type: WidgetType, props: RenderProps) {
  switch (type) {
    case "forms-summary":
      return <FormsSummarySettings {...props} />;
    case "programs-summary":
      return <ProgramsSummarySettings {...props} />;
    case "events-summary":
      return <EventsSummarySettings {...props} />;
    case "quick-links":
      return <QuickLinksSettings {...props} />;
    default:
      return null;
  }
}

export function widgetHasSettings(type: WidgetType): boolean {
  return type !== "ai-summary";
}
