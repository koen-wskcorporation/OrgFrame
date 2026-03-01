"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishStatusIcon } from "@/components/ui/publish-status-icon";
import { useToast } from "@/components/ui/toast";
import { publishFormVersionAction, saveFormDraftAction } from "@/modules/forms/actions";
import { FormCreatePanel } from "@/modules/forms/components/FormCreatePanel";
import type { OrgForm } from "@/modules/forms/types";
import type { Program } from "@/modules/programs/types";

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Forms</CardTitle>
            <Button disabled={!canWrite} onClick={() => setIsCreateOpen(true)} type="button">
              <Plus className="h-4 w-4" />
              Create form
            </Button>
          </div>
          <CardDescription>Open forms to edit schema, versions, and submissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedForms.length === 0 ? <Alert variant="info">No forms yet.</Alert> : null}
          {sortedForms.map((form) => (
            <Link className="block rounded-control border bg-surface px-3 py-3 hover:bg-surface-muted" href={`/${orgSlug}/tools/forms/${form.id}/editor`} key={form.id}>
              <div className="flex items-center gap-1.5">
                <PublishStatusIcon
                  disabled={!canWrite}
                  isLoading={isTogglingStatus && statusFormId === form.id}
                  isPublished={form.status === "published"}
                  onToggle={() => toggleFormStatus(form)}
                  statusLabel={form.status === "published" ? `Published status for ${form.name}` : `Unpublished status for ${form.name}`}
                />
                <p className="font-semibold text-text">{form.name}</p>
              </div>
              <p className="text-xs text-text-muted">
                {form.formKind === "program_registration" ? "Program registration" : "Generic"} · {form.status}
              </p>
              <p className="mt-1 text-sm text-text-muted">/{orgSlug}/register/{form.slug}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <FormCreatePanel canWrite={canWrite} onClose={() => setIsCreateOpen(false)} open={isCreateOpen} orgSlug={orgSlug} programs={programs} />
    </div>
  );
}
