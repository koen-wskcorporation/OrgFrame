import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LinkPickerField } from "@/components/shared/LinkPickerField";
import { ReadMoreDescription } from "@/modules/site-builder/blocks/read-more-description.client";
import { asBody, asCtaItems, asObject, asText, createId } from "@/modules/site-builder/blocks/helpers";
import type { BlockContext, BlockEditorProps, BlockRenderProps, CtaGridBlockConfig } from "@/modules/site-builder/types";
import { defaultInternalLink, isExternalLink, resolveLinkHref } from "@/lib/links";

function defaultQuickLinksConfig(context: BlockContext): CtaGridBlockConfig {
  return {
    title: "Quick Links",
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

  return {
    title: asText(value.title, fallback.title, 120),
    items: asCtaItems(value.items, fallback.items)
  };
}

export function CtaGridBlockRender({ block, context }: BlockRenderProps<"cta_grid">) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-text">{block.config.title}</h2>
      <div className="grid items-stretch gap-4 md:grid-cols-3">
        {block.config.items.map((item) => (
          <a
            className="flex h-full min-w-0"
            href={resolveLinkHref(context.orgSlug, item.link)}
            key={item.id}
            rel={isExternalLink(item.link) ? "noreferrer" : undefined}
            target={isExternalLink(item.link) ? "_blank" : undefined}
          >
            <Card className="flex h-full w-full min-w-0 flex-col transition-colors hover:bg-surface-muted">
              <CardHeader className="flex h-full min-w-0 flex-col items-start justify-start pb-6 text-left">
                <CardTitle className="min-w-0 break-all whitespace-normal text-base">{item.title}</CardTitle>
                <ReadMoreDescription>{item.description}</ReadMoreDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </div>
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
                <Textarea
                  className="min-h-[90px]"
                  onChange={(event) => {
                    updateItem(item.id, { description: asBody(event.target.value, "", 180) });
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
