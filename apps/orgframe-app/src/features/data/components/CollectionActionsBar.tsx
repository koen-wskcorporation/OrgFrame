"use client";

import { useTransition } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { deleteCollectionAction, toggleCollectionPinAction } from "@/src/features/data/actions";

type CollectionActionsBarProps = {
  orgSlug: string;
  collectionId: string;
  pinned: boolean;
};

export function CollectionActionsBar({ orgSlug, collectionId, pinned }: CollectionActionsBarProps) {
  const [isPending, startTransition] = useTransition();

  function togglePin() {
    startTransition(async () => {
      await toggleCollectionPinAction({ orgSlug, id: collectionId, pinned: !pinned });
    });
  }

  function remove() {
    if (!confirm("Delete this collection? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteCollectionAction({ orgSlug, id: collectionId });
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={togglePin} disabled={isPending}>
        {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
        {pinned ? "Unpin" : "Pin"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={isPending}>
        <Trash2 aria-hidden />
        Delete
      </Button>
    </div>
  );
}
