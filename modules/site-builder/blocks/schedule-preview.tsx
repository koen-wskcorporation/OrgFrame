import { buttonVariants } from "@/components/ui/button";
import { ButtonListEditor } from "@/components/editor/buttons/ButtonListEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { asBody, asButtons, asObject, asText } from "@/modules/site-builder/blocks/helpers";
import type { BlockContext, BlockEditorProps, BlockRenderProps, SchedulePreviewBlockConfig } from "@/modules/site-builder/types";
import { defaultInternalHref, resolveButtonHref } from "@/lib/links";

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

export function SchedulePreviewBlockRender({ block, context }: BlockRenderProps<"schedule_preview">) {
  return (
    <section id="schedule">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{block.config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>
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
      <FormField label="Title">
        <Input
          onChange={(event) => {
            updateConfig({ title: event.target.value });
          }}
          value={block.config.title}
        />
      </FormField>
      <FormField label="Body">
        <Textarea
          className="min-h-[90px]"
          onChange={(event) => {
            updateConfig({ body: event.target.value });
          }}
          value={block.config.body}
        />
      </FormField>

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
