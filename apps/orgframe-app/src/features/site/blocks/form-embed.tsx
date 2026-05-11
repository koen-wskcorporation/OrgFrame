import { Button } from "@orgframe/ui/primitives/button";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { Select } from "@orgframe/ui/primitives/select";
import { LogIn } from "lucide-react";
import { asBody, asObject, asText } from "@/src/features/site/blocks/helpers";
import { RegistrationFormClient } from "@/src/features/forms/components/RegistrationFormClient";
import type { BlockContext, BlockEditorProps, BlockRenderProps, FormEmbedBlockConfig } from "@/src/features/site/types";

function defaultFormEmbedConfig(_: BlockContext): FormEmbedBlockConfig {
  return {
    title: "Registration Form",
    body: "Choose a published form to display on this page.",
    formId: null
  };
}

export function createDefaultFormEmbedConfig(context: BlockContext) {
  return defaultFormEmbedConfig(context);
}

export function sanitizeFormEmbedConfig(config: unknown, context: BlockContext): FormEmbedBlockConfig {
  const fallback = defaultFormEmbedConfig(context);
  const value = asObject(config);
  const rawFormId = typeof value.formId === "string" ? value.formId.trim() : "";

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 320),
    formId: rawFormId.length > 0 ? rawFormId.slice(0, 64) : null
  };
}

function getPagePath(context: BlockContext) {
  if (context.pageSlug === "home") {
    return `/${context.orgSlug}`;
  }

  return `/${context.orgSlug}/${context.pageSlug}`;
}

export function FormEmbedBlockRender({ block, context, runtimeData, isEditing, onChange }: BlockRenderProps<"form_embed">) {
  const formRuntime = runtimeData.formEmbed;
  const publishedForms = formRuntime?.publishedForms ?? [];
  const selectedForm = publishedForms.find((form) => form.id === block.config.formId) ?? null;
  const requireSignIn = selectedForm ? selectedForm.settingsJson.requireSignIn !== false : true;
  const canInlineEdit = isEditing && Boolean(onChange);

  return (
    <section id="form-embed">
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

          {!selectedForm ? (
            <Alert variant="info">Choose a published form in block settings to display it here.</Alert>
          ) : isEditing ? (
            <Alert variant="info">Preview mode. Save and view the page to complete this form.</Alert>
          ) : !formRuntime?.viewer && requireSignIn ? (
            <div className="space-y-3">
              <Alert variant="info">Sign in to complete this form.</Alert>
              <Button href={`/auth?next=${encodeURIComponent(getPagePath(context))}`} variant="secondary">
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            </div>
          ) : (
            <RegistrationFormClient
              form={selectedForm}
              formSlug={selectedForm.slug}
              orgSlug={context.orgSlug}
              players={formRuntime?.players ?? []}
              programNodes={selectedForm.programId ? (formRuntime?.programNodesByProgramId[selectedForm.programId] ?? []) : []}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function FormEmbedBlockEditor({ block, onChange, runtimeData }: BlockEditorProps<"form_embed">) {
  const formOptions = (runtimeData.formEmbed?.publishedForms ?? []).map((form) => ({
    label: form.name,
    value: form.id
  }));

  function updateConfig(patch: Partial<FormEmbedBlockConfig>) {
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
      <FormField label="Published form">
        <Select
          disabled={formOptions.length === 0}
          onChange={(event) => {
            const value = event.target.value.trim();
            updateConfig({ formId: value.length > 0 ? value : null });
          }}
          options={[
            {
              label: "No form selected",
              value: ""
            },
            ...formOptions
          ]}
          value={block.config.formId ?? ""}
        />
      </FormField>

      {formOptions.length === 0 ? <Alert variant="info">No published forms are available yet.</Alert> : null}
    </div>
  );
}
