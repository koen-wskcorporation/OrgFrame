"use client";

import { ButtonListEditor } from "@orgframe/ui/editor/buttons/ButtonListEditor";
import { RichTextEditor } from "@orgframe/ui/editor/RichTextEditor";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
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
        <RichTextEditor
          minHeight={120}
          onChange={(next) => {
            updateConfig({ subheadline: next });
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
