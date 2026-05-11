import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Button } from "@orgframe/ui/primitives/button";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { asObject, asText, createId } from "@/src/features/site/blocks/helpers";
import { plainTextToRichTextHtml, richTextHtmlToPlainText, sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
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

export function AnnouncementHighlightBlockRender({ block, isEditing, onChange }: BlockRenderProps<"announcement_highlight">) {
  const canInlineEdit = isEditing && Boolean(onChange);
  const updateItem = (itemId: string, patch: Partial<AnnouncementHighlightBlockConfig["items"][number]>) => {
    if (!onChange) return;
    onChange({
      ...block,
      config: {
        ...block.config,
        items: block.config.items.map((entry) => (entry.id === itemId ? { ...entry, ...patch } : entry))
      }
    });
  };

  return (
    <section className="space-y-4">
      {canInlineEdit ? (
        <InlineText
          as="h2"
          className="text-2xl font-semibold text-text"
          maxLength={120}
          onCommit={(next) => onChange?.({ ...block, config: { ...block.config, title: next } })}
          placeholder="Section title"
          value={block.config.title}
        />
      ) : (
        <h2 className="text-2xl font-semibold text-text">{block.config.title}</h2>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              {canInlineEdit ? (
                <InlineText
                  as="h3"
                  className="text-base font-semibold"
                  maxLength={120}
                  onCommit={(next) => updateItem(item.id, { title: next })}
                  placeholder="Announcement title"
                  value={item.title}
                />
              ) : (
                <CardTitle className="text-base">{item.title}</CardTitle>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {canInlineEdit ? (
                <InlineText
                  className="text-xs font-semibold uppercase tracking-wide text-text-muted"
                  maxLength={60}
                  onCommit={(next) => updateItem(item.id, { dateLabel: next })}
                  placeholder="Date label (optional)"
                  value={item.dateLabel}
                />
              ) : item.dateLabel ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{item.dateLabel}</p>
              ) : null}
              {canInlineEdit ? (
                <InlineText
                  multiline
                  className="prose max-w-none text-sm text-text-muted"
                  onCommit={(next) => updateItem(item.id, { body: plainTextToRichTextHtml(next) })}
                  placeholder="Body"
                  value={richTextHtmlToPlainText(item.body)}
                />
              ) : (
                <div className="prose max-w-none text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: item.body }} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * Announcement-highlight settings editor.
 *
 * The section title, per-item title, date label, and body are all
 * inline-editable on the page itself (see `AnnouncementHighlightBlockRender`)
 * so this panel only manages the count of announcements — the user adds or
 * removes cards here, then fills them in directly on the page.
 */
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
      <p className="text-sm text-text-muted">
        Tap the section title, card titles, date labels, and bodies on the page to
        edit them in place. Use the controls below to add or remove cards.
      </p>

      <div className="flex flex-wrap gap-2">
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
