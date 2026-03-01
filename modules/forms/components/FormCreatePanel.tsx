"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createFormAction } from "@/modules/forms/actions";
import type { Program } from "@/modules/programs/types";

type FormCreatePanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  programs: Program[];
  canWrite?: boolean;
  fixedProgram?: {
    id: string;
    name: string;
  };
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function FormCreatePanel({ open, onClose, orgSlug, programs, canWrite = true, fixedProgram }: FormCreatePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();

  const isProgramLocked = Boolean(fixedProgram);
  const lockedName = fixedProgram ? `${fixedProgram.name} Registration` : "";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [formKind, setFormKind] = useState<"generic" | "program_registration">("program_registration");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [programId, setProgramId] = useState("");
  const [targetMode, setTargetMode] = useState<"locked" | "choice">("choice");
  const [allowMultiplePlayers, setAllowMultiplePlayers] = useState(false);
  const [requireSignIn, setRequireSignIn] = useState(true);

  const resolvedName = isProgramLocked ? lockedName : name;
  const resolvedFormKind = isProgramLocked ? "program_registration" : formKind;
  const resolvedProgramId = isProgramLocked ? fixedProgram?.id ?? "" : programId;

  const isSaveDisabled = useMemo(() => {
    if (!canWrite || isSaving) {
      return true;
    }

    if (!resolvedName.trim()) {
      return true;
    }

    if (resolvedFormKind === "program_registration" && !resolvedProgramId) {
      return true;
    }

    return false;
  }, [canWrite, isSaving, resolvedFormKind, resolvedName, resolvedProgramId]);

  function resetState() {
    setName("");
    setSlug("");
    setDescription("");
    setProgramId("");
    setAllowMultiplePlayers(false);
    setRequireSignIn(true);
    setTargetMode("choice");
    setFormKind("program_registration");
    setStatus("draft");
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite) {
      return;
    }

    if (resolvedFormKind === "program_registration" && !resolvedProgramId) {
      toast({
        title: "Program required",
        description: "Choose a program for registration forms.",
        variant: "destructive"
      });
      return;
    }

    const resolvedSlug = slug || slugify(resolvedName);
    if (!resolvedSlug) {
      toast({
        title: "Missing slug",
        description: "Provide a form name or slug.",
        variant: "destructive"
      });
      return;
    }

    startSaving(async () => {
      const result = await createFormAction({
        orgSlug,
        slug: resolvedSlug,
        name: resolvedName,
        description,
        formKind: resolvedFormKind,
        status,
        programId: resolvedFormKind === "program_registration" ? resolvedProgramId || null : null,
        targetMode,
        lockedProgramNodeId: null,
        allowMultiplePlayers,
        requireSignIn
      });

      if (!result.ok) {
        toast({
          title: "Unable to create form",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Form created",
        variant: "success"
      });
      resetState();
      onClose();
      router.push(`/${orgSlug}/tools/forms/${result.data.formId}/editor`);
    });
  }

  return (
    <Panel
      footer={
        <>
          <Button onClick={handleClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={isSaveDisabled} form="create-form-form" loading={isSaving} type="submit">
            {isSaving ? "Saving..." : "Create form"}
          </Button>
        </>
      }
      onClose={handleClose}
      open={open}
      subtitle={isProgramLocked ? "Create a registration form linked to this program." : "Build generic forms and program registration forms."}
      title="Create form"
    >
      <form className="grid gap-4 md:grid-cols-2" id="create-form-form" onSubmit={handleCreate}>
        <FormField hint={isProgramLocked ? "Auto-generated from the linked program." : undefined} label="Form name">
          <Input
            disabled={!canWrite || isProgramLocked}
            onChange={(event) => setName(event.target.value)}
            required
            value={resolvedName}
          />
        </FormField>
        <FormField label="Slug">
          <Input
            disabled={!canWrite}
            onChange={(event) => setSlug(slugify(event.target.value))}
            slugValidation={{
              kind: "form",
              orgSlug
            }}
            value={slug}
          />
        </FormField>
        <FormField label="Kind">
          <Select
            disabled={!canWrite || isProgramLocked}
            onChange={(event) => setFormKind(event.target.value as "generic" | "program_registration")}
            options={[
              { value: "program_registration", label: "Program registration" },
              { value: "generic", label: "Generic" }
            ]}
            value={resolvedFormKind}
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
        {resolvedFormKind === "program_registration" ? (
          <>
            <FormField label="Program">
              <Select
                disabled={!canWrite || isProgramLocked}
                onChange={(event) => setProgramId(event.target.value)}
                options={[
                  { value: "", label: "Select a program" },
                  ...programs.map((program) => ({ value: program.id, label: program.name }))
                ]}
                value={resolvedProgramId}
              />
            </FormField>
            <FormField label="Targeting mode">
              <Select
                disabled={!canWrite}
                onChange={(event) => setTargetMode(event.target.value as "locked" | "choice")}
                options={[
                  { value: "choice", label: "Registrant chooses" },
                  { value: "locked", label: "Admin-locked target" }
                ]}
                value={targetMode}
              />
            </FormField>
            <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text md:col-span-2">
              <Checkbox checked={allowMultiplePlayers} disabled={!canWrite} onChange={(event) => setAllowMultiplePlayers(event.target.checked)} />
              Allow multiple players per submission
            </label>
          </>
        ) : null}
        <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text md:col-span-2">
          <Checkbox
            checked={requireSignIn}
            disabled={!canWrite}
            onChange={(event) => setRequireSignIn(event.target.checked)}
          />
          Require sign-in to submit
        </label>
        <FormField className="md:col-span-2" label="Description">
          <Textarea className="min-h-[90px]" disabled={!canWrite} onChange={(event) => setDescription(event.target.value)} value={description} />
        </FormField>
      </form>
    </Panel>
  );
}
