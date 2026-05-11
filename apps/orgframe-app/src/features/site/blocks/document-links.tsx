import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Button } from "@orgframe/ui/primitives/button";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { RichTextEditor } from "@/src/features/core/editor/components/RichTextEditor";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { asObject, asText, createId } from "@/src/features/site/blocks/helpers";
import { sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
import type { BlockContext, BlockEditorProps, BlockRenderProps, DocumentLinksBlockConfig } from "@/src/features/site/types";

function defaultConfig(): DocumentLinksBlockConfig {
  return {
    title: "Resources",
    items: [
      {
        id: createId(),
        title: "Season Handbook",
        description: "<p>Policies, code of conduct, and important dates.</p>",
        href: "#"
      }
    ]
  };
}

export function createDefaultDocumentLinksConfig(_context: BlockContext) {
  return defaultConfig();
}

export function sanitizeDocumentLinksConfig(config: unknown, _context: BlockContext): DocumentLinksBlockConfig {
  const fallback = defaultConfig();
  const value = asObject(config);
  const rawItems = Array.isArray(value.items) ? value.items : fallback.items;

  return {
    title: asText(value.title, fallback.title, 120),
    items: rawItems.slice(0, 10).map((item, index) => {
      const row = asObject(item);
      return {
        id: asText(row.id, fallback.items[0]?.id ?? createId(), 80) || `${index}-${createId()}`,
        title: asText(row.title, `Document ${index + 1}`, 120),
        description: sanitizeRichTextHtml(row.description, ""),
        href: asText(row.href, "#", 600)
      };
    })
  };
}

export function DocumentLinksBlockRender({ block, isEditing, onChange }: BlockRenderProps<"document_links">) {
  const canInlineEdit = isEditing && Boolean(onChange);
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
      <div className="space-y-3">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="prose max-w-none text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: item.description }} />
              <Button href={item.href} size="sm" variant="secondary">
                Open
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function DocumentLinksBlockEditor({ block, onChange }: BlockEditorProps<"document_links">) {
  function updateConfig(patch: Partial<DocumentLinksBlockConfig>) {
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
      <div className="space-y-3">
        {block.config.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-sm">Document link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField label="Title">
                <Input
                  onChange={(event) =>
                    updateConfig({ items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, title: event.target.value } : entry)) })
                  }
                  value={item.title}
                />
              </FormField>
              <FormField label="Description">
                <RichTextEditor
                  minHeight={110}
                  onChange={(next) =>
                    updateConfig({
                      items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, description: next } : entry))
                    })
                  }
                  value={item.description}
                />
              </FormField>
              <FormField label="URL">
                <Input
                  onChange={(event) =>
                    updateConfig({ items: block.config.items.map((entry) => (entry.id === item.id ? { ...entry, href: event.target.value } : entry)) })
                  }
                  value={item.href}
                />
              </FormField>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={block.config.items.length >= 10}
          onClick={() => updateConfig({ items: [...block.config.items, { id: createId(), title: "New document", description: "", href: "#" }] })}
          size="sm"
          variant="secondary"
        >
          Add document
        </Button>
        <Button disabled={block.config.items.length <= 1} onClick={() => updateConfig({ items: block.config.items.slice(0, -1) })} size="sm" variant="ghost">
          Remove last
        </Button>
      </div>
    </div>
  );
}
