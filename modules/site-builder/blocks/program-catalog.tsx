import { buttonVariants } from "@/components/ui/button";
import { ButtonListEditor } from "@/components/editor/buttons/ButtonListEditor";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { asBody, asButtons, asNumber, asObject, asText } from "@/modules/site-builder/blocks/helpers";
import type { BlockContext, BlockEditorProps, BlockRenderProps, ProgramCatalogBlockConfig } from "@/modules/site-builder/types";
import { defaultInternalHref, resolveButtonHref } from "@/lib/links";

function defaultProgramCatalogConfig(_: BlockContext): ProgramCatalogBlockConfig {
  return {
    title: "Programs Catalog",
    body: "Highlight published programs directly on this page.",
    maxItems: 6,
    showDates: true,
    showType: true,
    buttons: [
      {
        id: "program-catalog-view-all",
        label: "View all programs",
        href: defaultInternalHref("programs"),
        variant: "secondary"
      }
    ]
  };
}

export function createDefaultProgramCatalogConfig(context: BlockContext) {
  return defaultProgramCatalogConfig(context);
}

export function sanitizeProgramCatalogConfig(config: unknown, context: BlockContext): ProgramCatalogBlockConfig {
  const fallback = defaultProgramCatalogConfig(context);
  const value = asObject(config);

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 320),
    maxItems: asNumber(value.maxItems, fallback.maxItems, 1, 24),
    showDates: Boolean(value.showDates ?? fallback.showDates),
    showType: Boolean(value.showType ?? fallback.showType),
    buttons: asButtons(value.buttons, fallback.buttons, { max: 3 })
  };
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }

  if (startDate) {
    return `Starts ${startDate}`;
  }

  if (endDate) {
    return `Ends ${endDate}`;
  }

  return "Dates to be announced";
}

function toTypeLabel(type: string, customTypeLabel: string | null) {
  if (type === "custom") {
    return customTypeLabel ?? "Custom";
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function ProgramCatalogBlockRender({ block, context, runtimeData }: BlockRenderProps<"program_catalog">) {
  const programs = (runtimeData.programCatalogItems ?? []).slice(0, block.config.maxItems);

  return (
    <section id="program-catalog">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{block.config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>

          {programs.length === 0 ? (
            <Alert variant="info">No published programs are available right now.</Alert>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {programs.map((program) => (
                <article className="rounded-control border bg-surface p-3" key={program.id}>
                  {program.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={`${program.name} cover`} className="mb-3 h-36 w-full rounded-control object-cover" src={program.coverImageUrl} />
                  ) : null}
                  <h3 className="font-semibold text-text">{program.name}</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {block.config.showType ? `${toTypeLabel(program.programType, program.customTypeLabel)} · ` : ""}
                    {block.config.showDates ? formatDateRange(program.startDate, program.endDate) : "Program details"}
                  </p>
                  <p className="mt-2 text-sm text-text-muted">{program.description ?? "View details and registration options."}</p>
                  <a className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/${context.orgSlug}/programs/${program.slug}`}>
                    View program
                  </a>
                </article>
              ))}
            </div>
          )}

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

export function ProgramCatalogBlockEditor({ block, onChange, context }: BlockEditorProps<"program_catalog">) {
  function updateConfig(patch: Partial<ProgramCatalogBlockConfig>) {
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

      <FormField label="Max items">
        <Input
          min={1}
          onChange={(event) => {
            updateConfig({
              maxItems: asNumber(event.target.value, block.config.maxItems, 1, 24)
            });
          }}
          step={1}
          type="number"
          value={String(block.config.maxItems)}
        />
      </FormField>

      <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
        <Checkbox
          checked={block.config.showDates}
          onChange={(event) => {
            updateConfig({ showDates: event.target.checked });
          }}
        />
        Show date ranges
      </label>

      <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
        <Checkbox
          checked={block.config.showType}
          onChange={(event) => {
            updateConfig({ showType: event.target.checked });
          }}
        />
        Show program type
      </label>

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
