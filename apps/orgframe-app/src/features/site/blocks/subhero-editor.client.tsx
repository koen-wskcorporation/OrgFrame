"use client";

import { ButtonListEditor } from "@/src/features/core/editor/buttons/ButtonListEditor";
import type { BlockEditorProps, SubheroBlockConfig } from "@/src/features/site/types";

/**
 * Subhero block settings editor. Headline and subheadline are edited
 * inline on the page itself (via `<InlineText>` in `SubheroBlockRender`)
 * so this panel only manages the auxiliary configuration — the buttons.
 */
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
