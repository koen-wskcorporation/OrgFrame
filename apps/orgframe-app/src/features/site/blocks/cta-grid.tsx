import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Trash2 } from "lucide-react";
import { RichTextEditor } from "@/src/features/core/editor/components/RichTextEditor";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { CtaGridRepeater } from "@/src/features/site/blocks/cta-grid-repeater";
import { LinkPickerField } from "@/src/features/core/layout/components/LinkPickerField";
import { asBody, asCtaItems, asObject, asText, createId } from "@/src/features/site/blocks/helpers";
import { sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
import type { BlockContext, BlockEditorProps, BlockRenderProps, CtaGridBlockConfig } from "@/src/features/site/types";
import { defaultInternalLink, isExternalLink, resolveLinkHref } from "@/src/shared/links";

function defaultQuickLinksConfig(context: BlockContext): CtaGridBlockConfig {
  return {
    title: "Featured Links",
    items: [
      {
        id: createId(),
        title: "Home",
        description: `Return to the ${context.orgName} homepage.`,
        link: defaultInternalLink("home")
      },
      {
        id: createId(),
        title: "Announcements",
        description: "See the latest public updates and highlights.",
        link: defaultInternalLink("home")
      }
    ]
  };
}

export function createDefaultCtaGridConfig(context: BlockContext) {
  return defaultQuickLinksConfig(context);
}

export function sanitizeCtaGridConfig(config: unknown, context: BlockContext): CtaGridBlockConfig {
  const fallback = defaultQuickLinksConfig(context);
  const value = asObject(config);
  const items = asCtaItems(value.items, fallback.items).map((item) => ({
    ...item,
    description: sanitizeRichTextHtml(item.description, fallback.items[0]?.description ?? "")
  }));

  return {
    title: asText(value.title, fallback.title, 120),
    items
  };
}

export function CtaGridBlockRender({ block, context }: BlockRenderProps<"cta_grid">) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-text">{block.config.title}</h2>
      <CtaGridRepeater
        items={block.config.items.map((item) => ({
          description: item.description,
          href: resolveLinkHref(context.orgSlug, item.link),
          id: item.id,
          isExternal: isExternalLink(item.link),
          title: item.title
        }))}
      />
    </section>
  );
}

export function CtaGridBlockEditor({ block, context, onChange }: BlockEditorProps<"cta_grid">) {
  function updateConfig(patch: Partial<CtaGridBlockConfig>) {
    onChange({
      ...block,
      config: {
        ...block.config,
        ...patch
      }
    });
  }

  function updateItem(itemId: string, patch: Partial<CtaGridBlockConfig["items"][number]>) {
    updateConfig({
      items: block.config.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        return {
          ...item,
          ...patch
        };
      })
    });
  }

  function addItem() {
    updateConfig({
      items: [
        ...block.config.items,
        {
          id: createId(),
          title: "New Link",
          description: "Describe this destination.",
          link: defaultInternalLink("home")
        }
      ].slice(0, 6)
    });
  }

  function removeItem(itemId: string) {
    const next = block.config.items.filter((item) => item.id !== itemId);

    if (!next.length) {
      return;
    }

    updateConfig({ items: next });
  }

  return (
    <div className="space-y-4">
      <FormField label="Section title">
        <Input
          onChange={(event) => {
            updateConfig({ title: event.target.value });
          }}
          value={block.config.title}
        />
      </FormField>

      <div className="space-y-3">
        {block.config.items.map((item, index) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-sm">Card {index + 1}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField label="Title">
                <Input
                  onChange={(event) => {
                    updateItem(item.id, { title: asText(event.target.value, "", 80) });
                  }}
                  value={item.title}
                />
              </FormField>

              <FormField label="Description">
                <RichTextEditor
                  minHeight={110}
                  onChange={(next) => {
                    updateItem(item.id, { description: asBody(next, "", 1000) });
                  }}
                  value={item.description}
                />
              </FormField>

              <LinkPickerField
                label="Link"
                onChange={(link) => {
                  updateItem(item.id, { link });
                }}
                orgSlug={context.orgSlug}
                value={item.link}
              />

              <Button onClick={() => removeItem(item.id)} size="sm" variant="ghost">
                <Trash2 className="h-4 w-4" />
                Remove card
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button disabled={block.config.items.length >= 6} onClick={addItem} size="sm" variant="secondary">
        Add card
      </Button>
    </div>
  );
}
