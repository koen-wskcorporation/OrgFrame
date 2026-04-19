"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { PublishStatusIcon } from "@orgframe/ui/primitives/publish-status-icon";
import { useToast } from "@orgframe/ui/primitives/toast";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import { publishFormVersionAction, saveFormDraftAction } from "@/src/features/forms/actions";
import { FormCreatePanel } from "@/src/features/forms/components/FormCreatePanel";
import type { OrgForm } from "@/src/features/forms/types";
import type { Program } from "@/src/features/programs/types";

type FormsManagePanelProps = {
  orgSlug: string;
  forms: OrgForm[];
  programs: Program[];
  canWrite?: boolean;
};

export function FormsManagePanel({ orgSlug, forms, programs, canWrite = true }: FormsManagePanelProps) {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTogglingStatus, startTogglingStatus] = useTransition();
  const [statusFormId, setStatusFormId] = useState<string | null>(null);
  const [formItems, setFormItems] = useState(forms);

  useEffect(() => {
    setFormItems(forms);
  }, [forms]);

  const sortedForms = useMemo(() => [...formItems].sort((a, b) => a.name.localeCompare(b.name)), [formItems]);

  function toggleFormStatus(form: OrgForm) {
    if (!canWrite) {
      return;
    }

    setStatusFormId(form.id);
    startTogglingStatus(async () => {
      try {
        const isPublished = form.status === "published";
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

        setFormItems((current) =>
          current.map((item) =>
            item.id === form.id
              ? {
                  ...item,
                  status: isPublished ? "draft" : "published"
                }
              : item
          )
        );
        toast({
          title: isPublished ? "Form unpublished" : "Form published",
          variant: "success"
        });
      } finally {
        setStatusFormId(null);
      }
    });
  }

  return (
    <div className="ui-stack-page">
      <WorkspaceCardShell
        actions={
          <Button disabled={!canWrite} onClick={() => setIsCreateOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            Create form
          </Button>
        }
        contentClassName="ui-list-stack"
        description="Open forms to edit schema, versions, and submissions."
        title="Forms"
      >
        {sortedForms.length === 0 ? <Alert variant="info">No forms yet.</Alert> : null}
        {sortedForms.map((form) => (
          <div className="ui-list-row ui-list-row-hover" key={form.id}>
            <div className="ui-list-row-content">
              <div className="flex items-center gap-1.5">
                <PublishStatusIcon
                  disabled={!canWrite}
                  isLoading={isTogglingStatus && statusFormId === form.id}
                  isPublished={form.status === "published"}
                  onToggle={() => toggleFormStatus(form)}
                  statusLabel={form.status === "published" ? `Published status for ${form.name}` : `Unpublished status for ${form.name}`}
                />
                <Link className="ui-list-row-title hover:underline" href={`/tools/forms/${form.id}/editor`}>
                  {form.name}
                </Link>
              </div>
              <p className="ui-list-row-meta">
                {form.formKind === "program_registration" ? "Program registration" : "Generic"} · {form.status}
              </p>
              <p className="text-sm text-text-muted">/register/{form.slug}</p>
            </div>
            <div className="ui-list-row-actions">
              <Button href={`/tools/forms/${form.id}/editor`} size="sm" variant="secondary">
                Open
              </Button>
            </div>
          </div>
        ))}
      </WorkspaceCardShell>

      <FormCreatePanel canWrite={canWrite} onClose={() => setIsCreateOpen(false)} open={isCreateOpen} orgSlug={orgSlug} programs={programs} />
    </div>
  );
}
