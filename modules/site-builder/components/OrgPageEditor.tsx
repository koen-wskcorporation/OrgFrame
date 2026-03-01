"use client";

import { GripVertical, Settings2, Trash2 } from "lucide-react";
import { SortableCanvas, type SortableHandleProps } from "@/components/editor/SortableCanvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBlockDefinition } from "@/modules/site-builder/blocks/registry";
import type { BlockContext, OrgPageBlock, OrgSiteRuntimeData } from "@/modules/site-builder/types";

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
  isActivePlaceholder: boolean;
  handleProps: SortableHandleProps;
  onSelectBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

function SortableBlockItem({ block, context, runtimeData, isActivePlaceholder, handleProps, onSelectBlock, onRemoveBlock }: SortableBlockItemProps) {
  const definition = getBlockDefinition(block.type);
  const Render = definition.Render;

  return (
    <Card className={isActivePlaceholder ? "border-accent border-dashed opacity-45" : undefined}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          {...handleProps.attributes}
          {...handleProps.listeners}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control border bg-surface"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
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

function DragPreview({ block }: { block: OrgPageBlock }) {
  const definition = getBlockDefinition(block.type);

  return (
    <Card className="w-[min(92vw,900px)] border-accent shadow-floating">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <GripVertical className="h-4 w-4 text-text-muted" />
        <p className="text-sm font-semibold text-text">{definition.displayName}</p>
      </div>
      <div className="px-3 py-2 text-xs text-text-muted">Dragging preview</div>
    </Card>
  );
}

export function OrgPageEditor({ blocks, context, runtimeData, onChangeBlocks, onSelectBlock, onRemoveBlock }: OrgPageEditorProps) {
  return (
    <div className="space-y-4">
      <SortableCanvas
        getId={(block) => block.id}
        items={blocks}
        onReorder={onChangeBlocks}
        renderItem={(block, meta) => (
          <SortableBlockItem
            block={block}
            context={context}
            handleProps={meta.handleProps}
            isActivePlaceholder={meta.isActivePlaceholder}
            onRemoveBlock={onRemoveBlock}
            onSelectBlock={onSelectBlock}
            runtimeData={runtimeData}
          />
        )}
        renderOverlay={(block) => {
          return <DragPreview block={block} />;
        }}
      />
    </div>
  );
}
