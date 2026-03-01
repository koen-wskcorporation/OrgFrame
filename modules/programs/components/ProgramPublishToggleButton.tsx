"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateProgramAction } from "@/modules/programs/actions";
import type { Program } from "@/modules/programs/types";

type ProgramPublishToggleButtonProps = {
  orgSlug: string;
  program: Program;
  canWrite: boolean;
};

export function ProgramPublishToggleButton({ orgSlug, program, canWrite }: ProgramPublishToggleButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isPublished = program.status === "published";

  function handleToggle() {
    if (!canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await updateProgramAction({
        orgSlug,
        programId: program.id,
        slug: program.slug,
        name: program.name,
        description: program.description ?? "",
        programType: program.programType,
        customTypeLabel: program.customTypeLabel ?? "",
        status: isPublished ? "draft" : "published",
        startDate: program.startDate ?? undefined,
        endDate: program.endDate ?? undefined,
        coverImagePath: program.coverImagePath ?? "",
        registrationOpenAt: program.registrationOpenAt ?? undefined,
        registrationCloseAt: program.registrationCloseAt ?? undefined
      });

      if (!result.ok) {
        toast({
          title: isPublished ? "Unable to unpublish program" : "Unable to publish program",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: isPublished ? "Program unpublished" : "Program published",
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
