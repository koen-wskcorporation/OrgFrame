"use client";

import { Button } from "@orgframe/ui/primitives/button";
import { mapActionTypeToVariant } from "@/src/features/ai/components/command-surface";
import type { AiSuggestedAction } from "@/src/features/ai/types";

type ContextActionsRowProps = {
  actions: AiSuggestedAction[];
  onAction: (action: AiSuggestedAction) => void;
};

export function ContextActionsRow({ actions, onAction }: ContextActionsRowProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <Button
          key={action.id}
          onClick={() => onAction(action)}
          size="sm"
          type="button"
          variant={mapActionTypeToVariant(action.actionType)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
