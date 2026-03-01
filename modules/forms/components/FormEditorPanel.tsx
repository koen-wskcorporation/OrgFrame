"use client";

import { useSearchParams } from "next/navigation";
import { Eye, Pencil, Settings2, Share2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { saveFormDraftAction } from "@/modules/forms/actions";
import { FormFieldsVisualEditor } from "@/modules/forms/components/FormFieldsVisualEditor";
import { FormSharingPanel } from "@/modules/forms/components/FormSharingPanel";
import { FormSettingsPanel } from "@/modules/forms/components/FormSettingsPanel";
import type { FormSchema, OrgForm } from "@/modules/forms/types";
import type { Program, ProgramNode } from "@/modules/programs/types";

type FormEditorPanelProps = {
  orgSlug: string;
  form: OrgForm;
  programs: Program[];
  programNodes: ProgramNode[];
  canWrite?: boolean;
};

export function FormEditorPanel({ orgSlug, form, programs, programNodes, canWrite = true }: FormEditorPanelProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();
  const [builderView, setBuilderView] = useState<"editor" | "preview">("editor");
  const [formSchema, setFormSchema] = useState<FormSchema>(form.schemaJson);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("panel") === "settings") {
      setSettingsOpen(true);
    }
  }, [searchParams]);

  function handleSaveDraft() {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const schemaPayload: FormSchema = {
        ...formSchema,
        title: form.name,
        description: form.description
      };

      const result = await saveFormDraftAction({
        orgSlug,
        formId: form.id,
        slug: form.slug,
        name: form.name,
        description: form.description ?? "",
        formKind: form.formKind,
        status: form.status,
        programId: form.programId,
        targetMode: form.targetMode,
        lockedProgramNodeId: form.lockedProgramNodeId,
        allowMultiplePlayers: Boolean(form.settingsJson.allowMultiplePlayers),
        requireSignIn: form.settingsJson.requireSignIn !== false,
        schemaJson: JSON.stringify(schemaPayload)
      });

      if (!result.ok) {
        toast({
          title: "Unable to save form",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Form saved",
        variant: "success"
      });
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Form Editor</CardTitle>
              <CardDescription>Build and preview your form pages and fields visually.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setSharingOpen(true)} type="button" variant="secondary">
                <Share2 className="h-4 w-4" />
                Sharing
              </Button>
              <Button onClick={() => setBuilderView((current) => (current === "editor" ? "preview" : "editor"))} type="button" variant="secondary">
                {builderView === "editor" ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {builderView === "editor" ? "Live preview" : "Editor"}
              </Button>
              <Button onClick={() => setSettingsOpen(true)} type="button" variant="secondary">
                <Settings2 className="h-4 w-4" />
                Settings
              </Button>
              <Button disabled={isSaving || !canWrite} loading={isSaving} onClick={handleSaveDraft} type="button">
                {isSaving ? "Saving..." : "Save draft"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <FormFieldsVisualEditor
            disabled={isSaving || !canWrite}
            formDescription={form.description ?? ""}
            formKind={form.formKind}
            formName={form.name}
            onChange={setFormSchema}
            orgSlug={orgSlug}
            programNodes={programNodes}
            schema={formSchema}
            view={builderView}
          />
        </CardContent>
      </Card>
      <FormSettingsPanel
        canWrite={canWrite}
        form={form}
        onClose={() => setSettingsOpen(false)}
        open={settingsOpen}
        orgSlug={orgSlug}
        programNodes={programNodes}
        programs={programs}
      />
      <FormSharingPanel formId={form.id} formSlug={form.slug} onClose={() => setSharingOpen(false)} open={sharingOpen} orgSlug={orgSlug} />
    </div>
  );
}
