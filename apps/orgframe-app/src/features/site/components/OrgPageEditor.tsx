"use client";

import { GripVertical, Settings2, Trash2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card } from "@orgframe/ui/primitives/card";
import { getBlockDefinition } from "@/src/features/site/blocks/registry";
import type { BlockContext, OrgPageBlock, OrgSiteRuntimeData } from "@/src/features/site/types";

type OrgPageEditorProps = {
  blocks: OrgPageBlock[];
  context: BlockContext;
  runtimeData: OrgSiteRuntimeData;
  onChangeBlocks: (blocks: OrgPageBlock[]) => void;
  onSelectBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

type SortableBlockItemProps = {
  block: OrgPageBlock;
  context: BlockContext;
  runtimeData: OrgSiteRuntimeData;
  onSelectBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

function SortableBlockItem({ block, context, runtimeData, onSelectBlock, onRemoveBlock }: SortableBlockItemProps) {
  const definition = getBlockDefinition(block.type);
  const Render = definition.Render;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-control border bg-surface">
          <GripVertical className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-text">{definition.displayName}</p>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => onSelectBlock(block.id)} size="sm" variant="secondary">
            <Settings2 className="h-4 w-4" />
            Settings
          </Button>
          <Button onClick={() => onRemoveBlock(block.id)} size="sm" variant="ghost">
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>
      <div className="p-4 md:p-5">
        <Render block={block as never} context={context} isEditing runtimeData={runtimeData} />
      </div>
    </Card>
  );
}

export function OrgPageEditor({ blocks, context, runtimeData, onChangeBlocks, onSelectBlock, onRemoveBlock }: OrgPageEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {blocks.map((block) => (
          <SortableBlockItem
            block={block}
            context={context}
            key={block.id}
            onRemoveBlock={onRemoveBlock}
            onSelectBlock={onSelectBlock}
            runtimeData={runtimeData}
          />
        ))}
      </div>
    </div>
  );
}
