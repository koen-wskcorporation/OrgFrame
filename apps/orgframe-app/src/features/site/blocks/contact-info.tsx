import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { Input } from "@orgframe/ui/primitives/input";
import { asObject, asText } from "@/src/features/site/blocks/helpers";
import { plainTextToRichTextHtml, richTextHtmlToPlainText, sanitizeRichTextHtml } from "@/src/features/site/blocks/rich-text";
import type { BlockContext, BlockEditorProps, BlockRenderProps, ContactInfoBlockConfig } from "@/src/features/site/types";

function defaultConfig(context: BlockContext): ContactInfoBlockConfig {
  return {
    title: "Contact",
    body: `<p>Questions about ${context.orgName}? Reach out and we will help.</p>`,
    email: "info@example.com",
    phone: "",
    address: ""
  };
}

export function createDefaultContactInfoConfig(context: BlockContext) {
  return defaultConfig(context);
}

export function sanitizeContactInfoConfig(config: unknown, context: BlockContext): ContactInfoBlockConfig {
  const fallback = defaultConfig(context);
  const value = asObject(config);
  return {
    title: asText(value.title, fallback.title, 120),
    body: sanitizeRichTextHtml(value.body, fallback.body),
    email: asText(value.email, fallback.email, 160),
    phone: asText(value.phone, fallback.phone, 60),
    address: asText(value.address, fallback.address, 240)
  };
}

export function ContactInfoBlockRender({ block, isEditing, onChange }: BlockRenderProps<"contact_info">) {
  const canInlineEdit = isEditing && Boolean(onChange);
  return (
    <section>
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
        <CardContent className="space-y-3">
          {canInlineEdit ? (
            <InlineText
              multiline
              className="prose block max-w-none text-sm text-text-muted"
              onCommit={(next) =>
                onChange?.({ ...block, config: { ...block.config, body: plainTextToRichTextHtml(next) } })
              }
              placeholder="Description"
              value={richTextHtmlToPlainText(block.config.body)}
            />
          ) : (
            <div className="prose max-w-none text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: block.config.body }} />
          )}
          {block.config.email ? (
            <p className="text-sm">
              Email:{" "}
              <a className="font-semibold text-accent hover:underline" href={`mailto:${block.config.email}`}>
                {block.config.email}
              </a>
            </p>
          ) : null}
          {block.config.phone ? <p className="text-sm text-text-muted">Phone: {block.config.phone}</p> : null}
          {block.config.address ? <p className="text-sm text-text-muted">Address: {block.config.address}</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}

export function ContactInfoBlockEditor({ block, onChange }: BlockEditorProps<"contact_info">) {
  function updateConfig(patch: Partial<ContactInfoBlockConfig>) {
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
      <FormField label="Email">
        <Input onChange={(event) => updateConfig({ email: event.target.value })} value={block.config.email} />
      </FormField>
      <FormField label="Phone">
        <Input onChange={(event) => updateConfig({ phone: event.target.value })} value={block.config.phone} />
      </FormField>
      <FormField label="Address">
        <Input onChange={(event) => updateConfig({ address: event.target.value })} value={block.config.address} />
      </FormField>
    </div>
  );
}
