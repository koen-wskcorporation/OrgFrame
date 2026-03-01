/* eslint-disable @next/next/no-img-element */

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { asBody, asButtons, asNumber, asObject, asOptionalStoragePath, asText } from "@/modules/site-builder/blocks/helpers";
import { getOrgSiteAssetPublicUrl } from "@/modules/site-builder/storage";
import type { BlockContext, BlockRenderProps, HeroBlockConfig } from "@/modules/site-builder/types";
import { defaultInternalHref, resolveButtonHref } from "@/lib/links";

function defaultHeroConfig(context: BlockContext): HeroBlockConfig {
  return {
    headline: context.orgName,
    subheadline: `Welcome to ${context.orgName}. Explore programs, key information, and upcoming updates.`,
    buttons: [
      {
        id: "hero-primary",
        label: "Learn More",
        href: defaultInternalHref("home"),
        variant: "primary"
      },
      {
        id: "hero-secondary",
        label: "Contact Us",
        href: "/contact",
        variant: "secondary"
      }
    ],
    backgroundImagePath: null,
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1
  };
}

export function sanitizeHeroConfig(config: unknown, context: BlockContext): HeroBlockConfig {
  const fallback = defaultHeroConfig(context);
  const value = asObject(config);

  const migratedButtons =
    Array.isArray(value.buttons) && value.buttons.length > 0
      ? value.buttons
      : [
          {
            id: "hero-primary",
            label: asText(value.primaryCtaLabel, fallback.buttons[0]?.label ?? "Learn More", 64),
            href: value.primaryCtaHref ?? fallback.buttons[0]?.href ?? "/",
            variant: "primary"
          },
          {
            id: "hero-secondary",
            label: asText(value.secondaryCtaLabel, fallback.buttons[1]?.label ?? "Learn More", 64),
            href: value.secondaryCtaHref ?? fallback.buttons[1]?.href ?? "/",
            variant: "secondary"
          }
        ];

  return {
    headline: asText(value.headline, fallback.headline, 120),
    subheadline: asBody(value.subheadline, fallback.subheadline, 320),
    buttons: asButtons(migratedButtons, fallback.buttons, { max: 3 }),
    backgroundImagePath: asOptionalStoragePath(value.backgroundImagePath),
    focalX: asNumber(value.focalX, fallback.focalX, 0, 1),
    focalY: asNumber(value.focalY, fallback.focalY, 0, 1),
    zoom: asNumber(value.zoom, fallback.zoom, 1, 2)
  };
}

export function createDefaultHeroConfig(context: BlockContext) {
  return defaultHeroConfig(context);
}

export function HeroBlockRender({ block, context }: BlockRenderProps<"hero">) {
  const imageUrl = getOrgSiteAssetPublicUrl(block.config.backgroundImagePath);
  const focalXPercent = Math.round(block.config.focalX * 100);
  const focalYPercent = Math.round(block.config.focalY * 100);
  const hasImage = Boolean(imageUrl);

  return (
    <section className="overflow-hidden rounded-card border bg-surface shadow-card">
      <div className="relative">
        {hasImage ? (
          <img
            alt={block.config.headline}
            className="absolute inset-0 h-full w-full object-cover"
            src={imageUrl ?? undefined}
            style={{
              objectPosition: `${focalXPercent}% ${focalYPercent}%`,
              transform: `scale(${block.config.zoom})`
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-surface-muted" />
        )}

        {hasImage ? <div className="absolute inset-0 bg-text/45" /> : null}

        <div className="relative z-10 flex min-h-[300px] items-center p-6 md:min-h-[360px] md:p-10">
          <div className="w-full space-y-4">
            <h1 className={hasImage ? "text-3xl font-semibold text-white md:text-5xl" : "text-3xl font-semibold text-text md:text-5xl"}>
              {block.config.headline}
            </h1>
            <p className={hasImage ? "text-sm text-white/90 md:text-lg" : "text-sm text-text-muted md:text-lg"}>{block.config.subheadline}</p>
            <div className="flex flex-wrap gap-3">
              {block.config.buttons.map((button) => (
                <a
                  className={cn(
                    buttonVariants({
                      size: "md",
                      variant: button.variant
                    }),
                    hasImage && button.variant !== "primary"
                      ? "border-white/70 bg-white/10 text-white hover:bg-white/20"
                      : null
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
          </div>
        </div>
      </div>
    </section>
  );
}
