"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { RepeaterChip } from "@orgframe/ui/primitives/chip";
import { PublishStatusIcon } from "@orgframe/ui/primitives/publish-status-icon";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { useToast } from "@orgframe/ui/primitives/toast";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
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
    if (!canWrite) return;

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
          : await publishFormVersionAction({ orgSlug, formId: form.id });

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
            item.id === form.id ? { ...item, status: isPublished ? "draft" : "published" } : item
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
    <>
      <PageShell title="Forms">
        {!canWrite ? <Alert variant="info">You have read-only access to forms.</Alert> : null}
        <Repeater
          emptyMessage="No forms yet."
          getSearchValue={(form) => `${form.name} ${form.slug}`}
          initialView="list"
          items={sortedForms}
          searchPlaceholder="Search forms"
          viewKey="manage.forms"
          renderShell={({ toolbar, body }) => (
            <ManageSection
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {toolbar}
                  <Button disabled={!canWrite} onClick={() => setIsCreateOpen(true)} type="button">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              }
              description="Open forms to edit schema, versions, and submissions."
              fill={false}
              title="Forms"
            >
              {body}
            </ManageSection>
          )}
          getItem={(form) => ({
              id: form.id,
              title: (
                <Link className="hover:underline" href={`/manage/forms/${form.id}/editor`}>
                  {form.name}
                </Link>
              ),
              chips: (
                <>
                  <PublishStatusIcon
                    disabled={!canWrite}
                    isLoading={isTogglingStatus && statusFormId === form.id}
                    isPublished={form.status === "published"}
                    onToggle={() => toggleFormStatus(form)}
                    statusLabel={form.status === "published" ? `Published status for ${form.name}` : `Unpublished status for ${form.name}`}
                  />
                  <RepeaterChip label={form.formKind === "program_registration" ? "Program registration" : "Generic"} />
                </>
              ),
              meta: <>/register/{form.slug}</>,
              primaryAction: (
                <Button href={`/manage/forms/${form.id}/editor`} size="sm" variant="secondary">
                  Open
                </Button>
              )
            })}
        />
      </PageShell>

      <FormCreatePanel canWrite={canWrite} onClose={() => setIsCreateOpen(false)} open={isCreateOpen} orgSlug={orgSlug} programs={programs} />
    </>
  );
}
