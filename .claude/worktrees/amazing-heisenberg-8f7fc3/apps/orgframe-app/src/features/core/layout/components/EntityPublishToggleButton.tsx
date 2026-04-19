"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { useToast } from "@orgframe/ui/primitives/toast";

type ToggleResult = { ok: true } | { ok: false; error: string };

type EntityPublishToggleButtonProps = {
  canWrite: boolean;
  isPublished: boolean;
  onTogglePublished: (nextPublished: boolean) => Promise<ToggleResult>;
  publishSuccessTitle: string;
  unpublishSuccessTitle: string;
  publishErrorTitle: string;
  unpublishErrorTitle: string;
};

export function EntityPublishToggleButton({
  canWrite,
  isPublished,
  onTogglePublished,
  publishSuccessTitle,
  unpublishSuccessTitle,
  publishErrorTitle,
  unpublishErrorTitle
}: EntityPublishToggleButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (!canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await onTogglePublished(!isPublished);
      if (!result.ok) {
        toast({
          title: isPublished ? unpublishErrorTitle : publishErrorTitle,
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: isPublished ? unpublishSuccessTitle : publishSuccessTitle,
        variant: "success"
      });
      router.refresh();
    });
  }

  return (
    <Button disabled={!canWrite || isPending} loading={isPending} onClick={handleToggle} type="button" variant={isPublished ? "secondary" : "primary"}>
      {isPublished ? "Unpublish" : "Publish"}
    </Button>
  );
}
