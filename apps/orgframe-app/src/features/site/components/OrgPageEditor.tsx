"use client";

import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  onChangeBlock: (block: OrgPageBlock) => void;
  onSelectBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

type SortableBlockItemProps = {
  block: OrgPageBlock;
  context: BlockContext;
  runtimeData: OrgSiteRuntimeData;
  onChangeBlock: (block: OrgPageBlock) => void;
  onSelectBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

function SortableBlockItem({ block, context, runtimeData, onChangeBlock, onSelectBlock, onRemoveBlock }: SortableBlockItemProps) {
  const definition = getBlockDefinition(block.type);
  const Render = definition.Render;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button
            iconOnly
            aria-label="Drag to reorder"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
          >
            <GripVertical />
          </Button>
          <p className="text-sm font-semibold text-text">{definition.displayName}</p>
          {/*
            Order: Remove first (least primary, lives near the title where the
            block identity is read), Settings second (rightmost — the
            "primary" per-section action, where the eye lands at the end of
            the toolbar).
          */}
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => onRemoveBlock(block.id)} size="sm" variant="ghost">
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
            <Button onClick={() => onSelectBlock(block.id)} size="sm" variant="secondary">
              <Settings2 className="h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <Render
            block={block as never}
            context={context}
            isEditing
            onChange={(next) => onChangeBlock(next as OrgPageBlock)}
            runtimeData={runtimeData}
          />
        </div>
      </Card>
    </div>
  );
}

export function OrgPageEditor({ blocks, context, runtimeData, onChangeBlocks, onChangeBlock, onSelectBlock, onRemoveBlock }: OrgPageEditorProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChangeBlocks(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <div className="space-y-4">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {blocks.map((block) => (
              <SortableBlockItem
                block={block}
                context={context}
                key={block.id}
                onChangeBlock={onChangeBlock}
                onRemoveBlock={onRemoveBlock}
                onSelectBlock={onSelectBlock}
                runtimeData={runtimeData}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
