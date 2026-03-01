"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { publishFormVersionAction, saveFormDraftAction } from "@/modules/forms/actions";
import type { OrgForm } from "@/modules/forms/types";

type FormPublishToggleButtonProps = {
  orgSlug: string;
  form: OrgForm;
  canWrite: boolean;
};

export function FormPublishToggleButton({ orgSlug, form, canWrite }: FormPublishToggleButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isPublished = form.status === "published";

  function handleToggle() {
    if (!canWrite) {
      return;
    }

    startTransition(async () => {
      const result = isPublished
        ? await saveFormDraftAction({
            orgSlug,
            formId: form.id,
            slug: form.slug,
            name: form.name,
            description: form.description ?? "",
            formKind: form.formKind,
            status: "draft",
            programId: form.programId,
            targetMode: form.targetMode,
            lockedProgramNodeId: form.lockedProgramNodeId,
            allowMultiplePlayers: Boolean(form.settingsJson.allowMultiplePlayers),
            requireSignIn: form.settingsJson.requireSignIn !== false,
            schemaJson: JSON.stringify(form.schemaJson)
          })
        : await publishFormVersionAction({
            orgSlug,
            formId: form.id
          });

      if (!result.ok) {
        toast({
          title: isPublished ? "Unable to unpublish form" : "Unable to publish form",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: isPublished ? "Form unpublished" : "Form published",
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
