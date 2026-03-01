"use client";

import { ButtonListEditor } from "@/components/editor/buttons/ButtonListEditor";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BlockEditorProps, SubheroBlockConfig } from "@/modules/site-builder/types";

export function SubheroBlockEditorClient({ block, context, onChange }: BlockEditorProps<"subhero">) {
  function updateConfig(patch: Partial<SubheroBlockConfig>) {
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
      <FormField label="Headline">
        <Input
          onChange={(event) => {
            updateConfig({ headline: event.target.value });
          }}
          value={block.config.headline}
        />
      </FormField>

      <FormField label="Subheadline">
        <Textarea
          className="min-h-[100px]"
          onChange={(event) => {
            updateConfig({ subheadline: event.target.value });
          }}
          value={block.config.subheadline}
        />
      </FormField>

      <ButtonListEditor
        addButtonLabel="Add button"
        emptyStateText="No buttons yet."
        maxButtons={3}
        onChange={(buttons) => updateConfig({ buttons })}
        orgSlug={context.orgSlug}
        value={block.config.buttons}
      />
    </div>
  );
}
