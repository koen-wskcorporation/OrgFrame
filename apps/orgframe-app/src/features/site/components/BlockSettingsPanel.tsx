"use client";

import * as React from "react";
import {
  CreateWizard,
  type CreateWizardSubmitResult,
  type WizardStep
} from "@/src/shared/components/CreateWizard";
import { getBlockDefinition } from "@/src/features/site/blocks/registry";
import type { BlockContext, OrgPageBlock, OrgSiteRuntimeData } from "@/src/features/site/types";

type BlockSettingsPanelProps = {
  open: boolean;
  block: OrgPageBlock | null;
  context: BlockContext;
  runtimeData: OrgSiteRuntimeData;
  onClose: () => void;
  onChange: (block: OrgPageBlock) => void;
};

/**
 * Wizard panel for editing one block on a page.
 *
 * Renders as a `<CreateWizard>` with up to two steps:
 *   1. **Design** — always present. Hosts the block's `Editor` component
 *      (appearance, copy, layout fields).
 *   2. **Data** — only rendered when the block definition exposes a
 *      `DataEditor` (data sources, filters, limits). Skipped via
 *      `skipWhen` for purely visual blocks.
 *
 * Edits flow through `onChange` live — the wizard's submit is a no-op that
 * just closes the panel. There's no separate "commit" boundary because the
 * page editor's outer toolbar owns save vs. discard for the whole page.
 */
export function BlockSettingsPanel({ open, block, context, runtimeData, onClose, onChange }: BlockSettingsPanelProps) {
  if (!block) {
    return null;
  }

  const definition = getBlockDefinition(block.type);
  const Editor = definition.Editor;
  const DataEditor = definition.DataEditor;

  // The wizard's own state is just a closure handle — block edits flow via
  // `onChange` to the parent (which owns `draftBlocks`). We keep an empty
  // state shape and a no-op submit so the wizard's create-mode footer can
  // render a "Done" button that simply closes the panel.
  type WizardState = Record<string, never>;
  const initialState: WizardState = React.useMemo(() => ({}), []);

  const steps: WizardStep<WizardState>[] = [
    {
      id: "design",
      label: "Design",
      description: "Appearance, copy, and layout.",
      render: () => (
        <Editor
          block={block as never}
          context={context}
          runtimeData={runtimeData}
          onChange={(next) => onChange(next as OrgPageBlock)}
        />
      )
    },
    {
      id: "data",
      label: "Data",
      description: "Source, filters, and limits.",
      // Only render when the block definition opts in via `DataEditor`.
      skipWhen: () => !DataEditor,
      render: () =>
        DataEditor ? (
          <DataEditor
            block={block as never}
            context={context}
            runtimeData={runtimeData}
            onChange={(next) => onChange(next as OrgPageBlock)}
          />
        ) : null
    }
  ];

  const handleSubmit = async (): Promise<CreateWizardSubmitResult> => {
    onClose();
    return { ok: true };
  };

  return (
    <CreateWizard<WizardState>
      hideCancel
      initialState={initialState}
      mode="create"
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Done"
      subtitle="Adjust content and options for this section."
      title={`${definition.displayName} settings`}
    />
  );
}
