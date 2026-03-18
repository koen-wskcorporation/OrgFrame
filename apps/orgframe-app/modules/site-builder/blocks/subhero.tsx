import { buttonVariants } from "@orgframe/ui/ui/button";
import { cn } from "@/lib/utils";
import { defaultInternalHref, normalizeButtons, resolveButtonHref } from "@/lib/links";
import { asObject, asText, defaultPageTitleFromSlug } from "@/modules/site-builder/blocks/helpers";
import { sanitizeRichTextHtml } from "@/modules/site-builder/blocks/rich-text";
import type { BlockContext, BlockRenderProps, SubheroBlockConfig } from "@/modules/site-builder/types";

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

export function SubheroBlockRender({ block, context }: BlockRenderProps<"subhero">) {
  return (
    <section className="rounded-card border bg-surface p-6 shadow-card md:p-10">
      <div className="w-full space-y-4">
        <h1 className="text-3xl font-semibold text-text md:text-5xl">{block.config.headline}</h1>
        <div className="prose max-w-none text-sm text-text-muted md:text-lg" dangerouslySetInnerHTML={{ __html: block.config.subheadline }} />
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
