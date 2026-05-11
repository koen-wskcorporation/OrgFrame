import { buttonVariants } from "@orgframe/ui/primitives/button";
import { ButtonListEditor } from "@/src/features/core/editor/buttons/ButtonListEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { asBody, asButtons, asObject, asText } from "@/src/features/site/blocks/helpers";
import type { BlockContext, BlockEditorProps, BlockRenderProps, SchedulePreviewBlockConfig } from "@/src/features/site/types";
import { defaultInternalHref, resolveButtonHref } from "@/src/shared/links";

function defaultSchedulePreviewConfig(_: BlockContext): SchedulePreviewBlockConfig {
  return {
    title: "Schedule Preview",
    body: "Upcoming game days and training highlights will appear here as schedule data is connected.",
    buttons: [
      {
        id: "schedule-primary",
        label: "Contact Our Team",
        href: defaultInternalHref("home"),
        variant: "secondary"
      }
    ]
  };
}

export function createDefaultSchedulePreviewConfig(context: BlockContext) {
  return defaultSchedulePreviewConfig(context);
}

export function sanitizeSchedulePreviewConfig(config: unknown, context: BlockContext): SchedulePreviewBlockConfig {
  const fallback = defaultSchedulePreviewConfig(context);
  const value = asObject(config);

  const migratedButtons =
    Array.isArray(value.buttons) && value.buttons.length > 0
      ? value.buttons
      : [
          {
            id: "schedule-primary",
            label: asText(value.ctaLabel, "Learn More", 64),
            href: value.ctaHref ?? fallback.buttons[0]?.href ?? "/",
            variant: "secondary"
          }
        ];

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 320),
    buttons: asButtons(migratedButtons, fallback.buttons, { max: 3 })
  };
}

export function SchedulePreviewBlockRender({ block, context, isEditing, onChange }: BlockRenderProps<"schedule_preview">) {
  const canInlineEdit = isEditing && Boolean(onChange);
  return (
    <section id="schedule">
      <Card>
        <CardHeader>
          {canInlineEdit ? (
            <InlineText
              as="h3"
              className="text-2xl font-semibold leading-tight tracking-tight text-text"
              maxLength={120}
              onCommit={(next) => onChange?.({ ...block, config: { ...block.config, title: next } })}
              placeholder="Title"
              value={block.config.title}
            />
          ) : (
            <CardTitle className="text-2xl">{block.config.title}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {canInlineEdit ? (
            <InlineText
              multiline
              className="text-sm text-text-muted md:text-base"
              maxLength={320}
              onCommit={(next) => onChange?.({ ...block, config: { ...block.config, body: next } })}
              placeholder="Body"
              value={block.config.body}
            />
          ) : (
            <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>
          )}
          <div className="rounded-control border border-dashed bg-surface-muted p-6 text-sm text-text-muted">Schedule data will surface here.</div>
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

export function SchedulePreviewBlockEditor({ block, onChange, context }: BlockEditorProps<"schedule_preview">) {
  function updateConfig(patch: Partial<SchedulePreviewBlockConfig>) {
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
      <ButtonListEditor
        maxButtons={3}
        onChange={(buttons) => {
          updateConfig({ buttons });
        }}
        orgSlug={context.orgSlug}
        value={block.config.buttons}
      />
    </div>
  );
}
