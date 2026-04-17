import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { RichTextEditor } from "@/src/features/core/editor/components/RichTextEditor";
import { asObject, asText, createId } from "@/src/features/site/blocks/helpers";
import { sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
import type { AnnouncementHighlightBlockConfig, BlockContext, BlockEditorProps, BlockRenderProps } from "@/src/features/site/types";

function defaultConfig(_context: BlockContext): AnnouncementHighlightBlockConfig {
  return {
    title: "Announcements",
    items: [
      {
        id: createId(),
        title: "Registration opens Monday",
        body: "<p>Secure your spot early. Registration closes once divisions are full.</p>",
        dateLabel: "This week"
      }
    ]
  };
}

export function createDefaultAnnouncementHighlightConfig(context: BlockContext) {
  return defaultConfig(context);
}

export function sanitizeAnnouncementHighlightConfig(config: unknown, context: BlockContext): AnnouncementHighlightBlockConfig {
  const fallback = defaultConfig(context);
  const value = asObject(config);
  const rawItems = Array.isArray(value.items) ? value.items : fallback.items;

  return {
    title: asText(value.title, fallback.title, 120),
    items: rawItems.slice(0, 6).map((item, index) => {
      const row = asObject(item);
      return {
        id: asText(row.id, fallback.items[0]?.id ?? createId(), 80) || `${index}-${createId()}`,
        title: asText(row.title, `Announcement ${index + 1}`, 120),
        body: sanitizeRichTextHtml(row.body, ""),
        dateLabel: asText(row.dateLabel, "", 60)
      };
    })
  };
}

export function AnnouncementHighlightBlockRender({ block }: BlockRenderProps<"announcement_highlight">) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-text">{block.config.title}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {item.dateLabel ? <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{item.dateLabel}</p> : null}
              <div className="prose max-w-none text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: item.body }} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function AnnouncementHighlightBlockEditor({ block, onChange }: BlockEditorProps<"announcement_highlight">) {
  function updateConfig(patch: Partial<AnnouncementHighlightBlockConfig>) {
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
      <FormField label="Section title">
        <Input onChange={(event) => updateConfig({ title: event.target.value })} value={block.config.title} />
      </FormField>

      <div className="space-y-3">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-sm">Announcement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField label="Title">
                <Input
                  onChange={(event) => {
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, title: event.target.value } : entry))
                    });
                  }}
                  value={item.title}
                />
              </FormField>
              <FormField label="Date label">
                <Input
                  onChange={(event) => {
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, dateLabel: event.target.value } : entry))
                    });
                  }}
                  value={item.dateLabel}
                />
              </FormField>
              <FormField label="Body">
                <RichTextEditor
                  minHeight={120}
                  onChange={(next) => {
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, body: next } : entry))
                    });
                  }}
                  value={item.body}
                />
              </FormField>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          disabled={block.config.items.length >= 6}
          onClick={() => {
            updateConfig({
              items: [
                ...block.config.items,
                {
                  id: createId(),
                  title: "New announcement",
                  body: "<p>Add details.</p>",
                  dateLabel: ""
                }
              ]
            });
          }}
          size="sm"
          variant="secondary"
        >
          Add announcement
        </Button>
        <Button
          disabled={block.config.items.length <= 1}
          onClick={() => {
            updateConfig({ items: block.config.items.slice(0, -1) });
          }}
          size="sm"
          variant="ghost"
        >
          Remove last
        </Button>
      </div>
    </div>
  );
}
