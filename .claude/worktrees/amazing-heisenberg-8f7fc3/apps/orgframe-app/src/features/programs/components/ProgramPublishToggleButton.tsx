"use client";

import { EntityPublishToggleButton } from "@/src/features/core/layout/components/EntityPublishToggleButton";
import { updateProgramAction } from "@/src/features/programs/actions";
import type { Program } from "@/src/features/programs/types";

type ProgramPublishToggleButtonProps = {
  orgSlug: string;
  program: Program;
  canWrite: boolean;
};

export function ProgramPublishToggleButton({ orgSlug, program, canWrite }: ProgramPublishToggleButtonProps) {
  const isPublished = program.status === "published";

  return (
    <EntityPublishToggleButton
      canWrite={canWrite}
      isPublished={isPublished}
      onTogglePublished={(nextPublished) =>
        updateProgramAction({
          orgSlug,
          programId: program.id,
          slug: program.slug,
          name: program.name,
          description: program.description ?? "",
          programType: program.programType,
          customTypeLabel: program.customTypeLabel ?? "",
          status: nextPublished ? "published" : "draft",
          startDate: program.startDate ?? undefined,
          endDate: program.endDate ?? undefined,
          coverImagePath: program.coverImagePath ?? "",
          registrationOpenAt: program.registrationOpenAt ?? undefined,
          registrationCloseAt: program.registrationCloseAt ?? undefined
        })
      }
      publishErrorTitle="Unable to publish program"
      publishSuccessTitle="Program published"
      unpublishErrorTitle="Unable to unpublish program"
      unpublishSuccessTitle="Program unpublished"
    />
  );
}
