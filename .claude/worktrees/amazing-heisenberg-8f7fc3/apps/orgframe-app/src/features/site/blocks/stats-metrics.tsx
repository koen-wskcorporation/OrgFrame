import { Card, CardContent } from "@orgframe/ui/primitives/card";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { asObject, asText, createId } from "@/src/features/site/blocks/helpers";
import type { BlockContext, BlockEditorProps, BlockRenderProps, StatsMetricsBlockConfig } from "@/src/features/site/types";

function defaultConfig(context: BlockContext): StatsMetricsBlockConfig {
  return {
    title: `At a glance`,
    items: [
      { id: createId(), label: "Programs", value: "12", detail: `Active opportunities in ${context.orgName}` },
      { id: createId(), label: "Teams", value: "38", detail: "Across all divisions" },
      { id: createId(), label: "Events", value: "22", detail: "Upcoming this season" }
    ]
  };
}

export function createDefaultStatsMetricsConfig(context: BlockContext) {
  return defaultConfig(context);
}

export function sanitizeStatsMetricsConfig(config: unknown, context: BlockContext): StatsMetricsBlockConfig {
  const fallback = defaultConfig(context);
  const value = asObject(config);
  const rawItems = Array.isArray(value.items) ? value.items : fallback.items;

  return {
    title: asText(value.title, fallback.title, 120),
    items: rawItems.slice(0, 8).map((item, index) => {
      const row = asObject(item);
      return {
        id: asText(row.id, fallback.items[0]?.id ?? createId(), 80) || `${index}-${createId()}`,
        label: asText(row.label, `Metric ${index + 1}`, 60),
        value: asText(row.value, "", 40),
        detail: asText(row.detail, "", 140)
      };
    })
  };
}

export function StatsMetricsBlockRender({ block }: BlockRenderProps<"stats_metrics">) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-text">{block.config.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-1 pt-5">
              <p className="text-xs uppercase tracking-wide text-text-muted">{item.label}</p>
              <p className="text-3xl font-semibold text-text">{item.value}</p>
              {item.detail ? <p className="text-xs text-text-muted">{item.detail}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function StatsMetricsBlockEditor({ block, onChange }: BlockEditorProps<"stats_metrics">) {
  function updateConfig(patch: Partial<StatsMetricsBlockConfig>) {
    onChange({ ...block, config: { ...block.config, ...patch } });
  }

  return (
    <div className="space-y-4">
      <FormField label="Section title">
        <Input onChange={(event) => updateConfig({ title: event.target.value })} value={block.config.title} />
      </FormField>
      <div className="space-y-3">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-3 pt-4">
              <FormField label="Label">
                <Input
                  onChange={(event) => {
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry))
                    });
                  }}
                  value={item.label}
                />
              </FormField>
              <FormField label="Value">
                <Input
                  onChange={(event) => {
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, value: event.target.value } : entry))
                    });
                  }}
                  value={item.value}
                />
              </FormField>
              <FormField label="Detail">
                <Input
                  onChange={(event) => {
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, detail: event.target.value } : entry))
                    });
                  }}
                  value={item.detail}
                />
              </FormField>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={block.config.items.length >= 8}
          onClick={() => updateConfig({ items: [...block.config.items, { id: createId(), label: "Metric", value: "", detail: "" }] })}
          size="sm"
          variant="secondary"
        >
          Add metric
        </Button>
        <Button disabled={block.config.items.length <= 1} onClick={() => updateConfig({ items: block.config.items.slice(0, -1) })} size="sm" variant="ghost">
          Remove last
        </Button>
      </div>
    </div>
  );
}
