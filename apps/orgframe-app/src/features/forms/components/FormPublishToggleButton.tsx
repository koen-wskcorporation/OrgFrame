"use client";

import { EntityPublishToggleButton } from "@/src/features/core/layout/components/EntityPublishToggleButton";
import { publishFormVersionAction, saveFormDraftAction } from "@/src/features/forms/actions";
import type { OrgForm } from "@/src/features/forms/types";

type FormPublishToggleButtonProps = {
  orgSlug: string;
  form: OrgForm;
  canWrite: boolean;
};

export function FormPublishToggleButton({ orgSlug, form, canWrite }: FormPublishToggleButtonProps) {
  const isPublished = form.status === "published";

  return (
    <EntityPublishToggleButton
      canWrite={canWrite}
      isPublished={isPublished}
      onTogglePublished={(nextPublished) =>
        nextPublished
          ? publishFormVersionAction({
              orgSlug,
              formId: form.id
            })
          : saveFormDraftAction({
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
      }
      publishErrorTitle="Unable to publish form"
      publishSuccessTitle="Form published"
      unpublishErrorTitle="Unable to unpublish form"
      unpublishSuccessTitle="Form unpublished"
    />
  );
}
