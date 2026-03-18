import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
import { RichTextEditor } from "@orgframe/ui/editor/RichTextEditor";
import { asObject, asText } from "@/modules/site-builder/blocks/helpers";
import { sanitizeRichTextHtml } from "@/modules/site-builder/blocks/rich-text";
import type { BlockContext, BlockEditorProps, BlockRenderProps, ContactInfoBlockConfig } from "@/modules/site-builder/types";

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

export function ContactInfoBlockRender({ block }: BlockRenderProps<"contact_info">) {
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{block.config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="prose max-w-none text-sm text-text-muted" dangerouslySetInnerHTML={{ __html: block.config.body }} />
          {block.config.email ? (
            <p className="text-sm">
              Email:{" "}
              <a className="font-semibold text-link hover:underline" href={`mailto:${block.config.email}`}>
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
      <FormField label="Title">
        <Input onChange={(event) => updateConfig({ title: event.target.value })} value={block.config.title} />
      </FormField>
      <FormField label="Description">
        <RichTextEditor minHeight={120} onChange={(next) => updateConfig({ body: next })} value={block.config.body} />
      </FormField>
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
