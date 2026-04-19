"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardHeader, CardHeaderRow } from "@orgframe/ui/primitives/card";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { useToast } from "@orgframe/ui/primitives/toast";
import { saveFormDraftAction } from "@/src/features/forms/actions";
import type { OrgForm } from "@/src/features/forms/types";
import type { Program, ProgramNode } from "@/src/features/programs/types";

type FormSettingsPanelProps = {
  orgSlug: string;
  form: OrgForm;
  programs: Program[];
  programNodes: ProgramNode[];
  canWrite?: boolean;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function FormSettingsPanel({ orgSlug, form, programs, programNodes, canWrite = true }: FormSettingsPanelProps) {
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();

  const [name, setName] = useState(form.name);
  const [slug, setSlug] = useState(form.slug);
  const [description, setDescription] = useState(form.description ?? "");
  const [formKind, setFormKind] = useState<"generic" | "program_registration">(form.formKind);
  const [status, setStatus] = useState<"draft" | "published" | "archived">(form.status);
  const [programId, setProgramId] = useState(form.programId ?? "");
  const [targetMode, setTargetMode] = useState<"locked" | "choice">(form.targetMode);
  const [lockedProgramNodeId, setLockedProgramNodeId] = useState(form.lockedProgramNodeId ?? "");
  const [allowMultiplePlayers, setAllowMultiplePlayers] = useState(Boolean(form.settingsJson.allowMultiplePlayers));
  const [requireSignIn, setRequireSignIn] = useState(form.settingsJson.requireSignIn !== false);
  const effectiveRequireSignIn = formKind === "program_registration" ? true : requireSignIn;
  const registrationProgramName = useMemo(() => programs.find((program) => program.id === programId)?.name ?? null, [programs, programId]);

  useEffect(() => {
    if (formKind === "program_registration" && registrationProgramName) {
      setName(`${registrationProgramName} Registration`);
    }
  }, [formKind, registrationProgramName]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleSaveDraft();
  }

  function handleSaveDraft() {
    if (!canWrite) {
      return;
    }

    if (formKind === "program_registration" && !programId) {
      toast({
        title: "Program required",
        description: "Choose a program for registration forms.",
        variant: "destructive"
      });
      return;
    }

    if (targetMode === "locked" && !lockedProgramNodeId && formKind === "program_registration") {
      toast({
        title: "Locked target required",
        description: "Select a locked program structure node.",
        variant: "destructive"
      });
      return;
    }

    startSaving(async () => {
      const result = await saveFormDraftAction({
        orgSlug,
        formId: form.id,
        slug: slug || slugify(name),
        name,
        description,
        formKind,
        status,
        programId: formKind === "program_registration" ? programId || null : null,
        targetMode,
        lockedProgramNodeId: targetMode === "locked" ? lockedProgramNodeId || null : null,
        allowMultiplePlayers,
        requireSignIn: effectiveRequireSignIn,
        schemaJson: JSON.stringify(form.schemaJson)
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
        title: "Settings saved",
        variant: "success"
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardHeaderRow
          actions={
            <Button disabled={isSaving || !canWrite} form="form-settings-form" loading={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          }
          description="Configure metadata, registration linkage, and publishing behavior."
          title="Form settings"
        />
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" id="form-settings-form" onSubmit={handleSubmit}>
          <FormField hint={formKind === "program_registration" ? "Auto-generated from the linked program." : undefined} label="Form name">
            <Input
              disabled={!canWrite || formKind === "program_registration"}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </FormField>
          <FormField label="Slug">
            <Input
              disabled={!canWrite}
              onChange={(event) => setSlug(slugify(event.target.value))}
              slugValidation={{
                kind: "form",
                orgSlug,
                currentSlug: form.slug
              }}
              value={slug}
            />
          </FormField>
          <FormField label="Kind">
            <Select
              disabled={!canWrite}
              onChange={(event) => setFormKind(event.target.value as "generic" | "program_registration")}
              options={[
                { value: "program_registration", label: "Program registration" },
                { value: "generic", label: "Generic" }
              ]}
              value={formKind}
            />
          </FormField>
          <FormField label="Status">
            <Select
              disabled={!canWrite}
              onChange={(event) => setStatus(event.target.value as "draft" | "published" | "archived")}
              options={[
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" }
              ]}
              value={status}
            />
          </FormField>

          {formKind === "program_registration" ? (
            <>
              <FormField label="Program">
                <Select
                  disabled={!canWrite}
                  onChange={(event) => setProgramId(event.target.value)}
                  options={[
                    { value: "", label: "Select a program" },
                    ...programs.map((program) => ({ value: program.id, label: program.name }))
                  ]}
                  value={programId}
                />
              </FormField>
              <FormField label="Target mode">
                <Select
                  disabled={!canWrite}
                  onChange={(event) => setTargetMode(event.target.value as "locked" | "choice")}
                  options={[
                    { value: "choice", label: "Registrant chooses" },
                    { value: "locked", label: "Admin-locked" }
                  ]}
                  value={targetMode}
                />
              </FormField>
              {targetMode === "locked" ? (
                <FormField className="md:col-span-2" label="Locked target node">
                  <Select
                    disabled={!canWrite}
                    onChange={(event) => setLockedProgramNodeId(event.target.value)}
                    options={[
                      { value: "", label: "Select a target" },
                      ...programNodes.map((node) => ({
                        value: node.id,
                        label: `${node.name} (${node.nodeKind})`
                      }))
                    ]}
                    value={lockedProgramNodeId}
                  />
                </FormField>
              ) : null}
              <label className="ui-inline-toggle md:col-span-2">
                <Checkbox
                  checked={allowMultiplePlayers}
                  disabled={!canWrite}
                  onChange={(event) => setAllowMultiplePlayers(event.target.checked)}
                />
                Allow multiple players per submission
              </label>
            </>
          ) : null}

          <label className="ui-inline-toggle md:col-span-2">
            <Checkbox
              checked={effectiveRequireSignIn}
              disabled={!canWrite || formKind === "program_registration"}
              onChange={(event) => setRequireSignIn(event.target.checked)}
            />
            Require sign-in to submit
            {formKind === "program_registration" ? " (required for registration forms)" : ""}
          </label>

          <FormField className="md:col-span-2" label="Description">
            <Textarea className="min-h-[90px]" disabled={!canWrite} onChange={(event) => setDescription(event.target.value)} value={description} />
          </FormField>
        </form>
      </CardContent>
    </Card>
  );
}
