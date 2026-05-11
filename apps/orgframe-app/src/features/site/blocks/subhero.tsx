import { buttonVariants } from "@orgframe/ui/primitives/button";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { cn } from "@/src/shared/utils";
import { defaultInternalHref, normalizeButtons, resolveButtonHref } from "@/src/shared/links";
import { asObject, asText, defaultPageTitleFromSlug } from "@/src/features/site/blocks/helpers";
import { plainTextToRichTextHtml, richTextHtmlToPlainText, sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
import type { BlockContext, BlockRenderProps, SubheroBlockConfig } from "@/src/features/site/types";

function defaultSubheroConfig(context: BlockContext): SubheroBlockConfig {
  return {
    headline: context.pageSlug === "home" ? context.orgName : defaultPageTitleFromSlug(context.pageSlug),
    subheadline: `Learn more about ${context.orgName}.`,
    buttons: [
      {
        id: "subhero-primary",
        label: "Back Home",
        href: defaultInternalHref("home"),
        variant: "primary"
      }
    ]
  };
}

export function sanitizeSubheroConfig(config: unknown, context: BlockContext): SubheroBlockConfig {
  const fallback = defaultSubheroConfig(context);
  const value = asObject(config);

  return {
    headline: asText(value.headline, fallback.headline, 120),
    subheadline: sanitizeRichTextHtml(value.subheadline, fallback.subheadline).slice(0, 3000),
    buttons: normalizeButtons(value.buttons, { max: 3 })
  };
}

export function createDefaultSubheroConfig(context: BlockContext) {
  return defaultSubheroConfig(context);
}

export function SubheroBlockRender({ block, context, isEditing, onChange }: BlockRenderProps<"subhero">) {
  const canInlineEdit = isEditing && Boolean(onChange);
  const headlineClass = "text-3xl font-semibold text-text md:text-5xl";
  const subheadlineClass = "prose max-w-none text-sm text-text-muted md:text-lg";

  return (
    <section className="rounded-card border bg-surface p-6 shadow-card md:p-10">
      <div className="w-full space-y-4">
        {canInlineEdit ? (
          <InlineText
            as="h1"
            className={headlineClass}
            maxLength={120}
            onCommit={(next) => onChange?.({ ...block, config: { ...block.config, headline: next } })}
            placeholder="Headline"
            value={block.config.headline}
          />
        ) : (
          <h1 className={headlineClass}>{block.config.headline}</h1>
        )}
        {canInlineEdit ? (
          <InlineText
            multiline
            className={cn(subheadlineClass, "block")}
            onCommit={(next) =>
              onChange?.({ ...block, config: { ...block.config, subheadline: plainTextToRichTextHtml(next) } })
            }
            placeholder="Subheadline"
            value={richTextHtmlToPlainText(block.config.subheadline)}
          />
        ) : (
          <div className={subheadlineClass} dangerouslySetInnerHTML={{ __html: block.config.subheadline }} />
        )}
        {block.config.buttons.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {block.config.buttons.map((button) => (
              <a
                className={cn(
                  buttonVariants({
                    size: "md",
                    variant: button.variant
                  })
                )}
                href={resolveButtonHref(context.orgSlug, button.href)}
                key={button.id}
                rel={button.newTab ? "noreferrer" : undefined}
                target={button.newTab ? "_blank" : undefined}
              >
                {button.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
