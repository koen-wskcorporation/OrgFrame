import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { defaultInternalHref, normalizeButtons, resolveButtonHref } from "@/lib/links";
import { asBody, asObject, asText, defaultPageTitleFromSlug } from "@/modules/site-builder/blocks/helpers";
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
    subheadline: asBody(value.subheadline, fallback.subheadline, 320),
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
        <p className="text-sm text-text-muted md:text-lg">{block.config.subheadline}</p>
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
