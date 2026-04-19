/* eslint-disable @next/next/no-img-element */

import { buttonVariants } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { cn } from "@/src/shared/utils";
import { asButtons, asNumber, asObject, asOptionalStoragePath, asText } from "@/src/features/site/blocks/helpers";
import { sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
import { CtaCardBlockEditorClient } from "@/src/features/site/blocks/cta-card-editor.client";
import { getOrgSiteAssetPublicUrl } from "@/src/features/site/storage";
import type { BlockContext, BlockRenderProps, CtaCardBlockConfig } from "@/src/features/site/types";
import { defaultInternalHref, resolveButtonHref } from "@/src/shared/links";

function defaultCtaCardConfig(context: BlockContext): CtaCardBlockConfig {
  return {
    heading: `Get Involved with ${context.orgName}`,
    body: "Use this card for key programs, registrations, or featured organization updates.",
    imagePath: null,
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    accentHighlight: true,
    buttons: [
      {
        id: "cta-card-primary",
        label: "Learn More",
        href: defaultInternalHref("home"),
        variant: "primary"
      }
    ]
  };
}

export function createDefaultCtaCardConfig(context: BlockContext) {
  return defaultCtaCardConfig(context);
}

export function sanitizeCtaCardConfig(config: unknown, context: BlockContext): CtaCardBlockConfig {
  const fallback = defaultCtaCardConfig(context);
  const value = asObject(config);

  const migratedButtons =
    Array.isArray(value.buttons) && value.buttons.length > 0
      ? value.buttons
      : [
          {
            id: "cta-card-primary",
            label: asText(value.ctaLabel, "Learn More", 64),
            href: value.ctaHref ?? fallback.buttons[0]?.href ?? "/",
            variant: "primary"
          }
        ];

  return {
    heading: asText(value.heading ?? value.title, fallback.heading, 120),
    body: sanitizeRichTextHtml(value.body, fallback.body).slice(0, 4000),
    imagePath: asOptionalStoragePath(value.imagePath ?? value.backgroundImagePath),
    focalX: asNumber(value.focalX, fallback.focalX, 0, 1),
    focalY: asNumber(value.focalY, fallback.focalY, 0, 1),
    zoom: asNumber(value.zoom, fallback.zoom, 1, 2),
    accentHighlight: typeof value.accentHighlight === "boolean" ? value.accentHighlight : fallback.accentHighlight,
    buttons: asButtons(migratedButtons, fallback.buttons, { max: 3 })
  };
}

export function CtaCardBlockRender({ block, context }: BlockRenderProps<"cta_card">) {
  const imageUrl = getOrgSiteAssetPublicUrl(block.config.imagePath);

  return (
    <section>
      <Card className={cn(block.config.accentHighlight ? "border-accent/40" : undefined)}>
        {imageUrl ? (
          <div className="relative aspect-[16/7] overflow-hidden rounded-t-card border-b bg-surface-muted">
            <img
              alt={block.config.heading}
              className="absolute inset-0 h-full w-full object-cover"
              src={imageUrl}
              style={{
                objectPosition: `${block.config.focalX * 100}% ${block.config.focalY * 100}%`,
                transform: `scale(${block.config.zoom})`
              }}
            />
          </div>
        ) : null}
        <CardHeader>
          <CardTitle className="text-2xl">{block.config.heading}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose max-w-none text-sm text-text-muted md:text-base" dangerouslySetInnerHTML={{ __html: block.config.body }} />
          <div className="flex flex-wrap gap-2">
            {block.config.buttons.map((button) => (
              <a
                className={buttonVariants({ variant: button.variant })}
                href={resolveButtonHref(context.orgSlug, button.href)}
                key={button.id}
                rel={button.newTab ? "noreferrer" : undefined}
                target={button.newTab ? "_blank" : undefined}
              >
                {button.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export const CtaCardBlockEditor = CtaCardBlockEditorClient;
