"use client";

import { Button } from "@orgframe/ui/primitives/button";
import { EditorSettingsDialog } from "@/src/features/core/layout/components/EditorSettingsDialog";
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

export function BlockSettingsPanel({ open, block, context, runtimeData, onClose, onChange }: BlockSettingsPanelProps) {
  if (!block) {
    return null;
  }

  const definition = getBlockDefinition(block.type);
  const Editor = definition.Editor;

  return (
    <EditorSettingsDialog
      description="Adjust content and options for this section."
      footer={
        <Button onClick={onClose} size="sm" variant="secondary">
          Done
        </Button>
      }
      onClose={onClose}
      open={open}
      title={`${definition.displayName} Settings`}
    >
      <Editor
        block={block as never}
        context={context}
        runtimeData={runtimeData}
        onChange={(next) => {
          onChange(next as OrgPageBlock);
        }}
      />
    </EditorSettingsDialog>
  );
}
