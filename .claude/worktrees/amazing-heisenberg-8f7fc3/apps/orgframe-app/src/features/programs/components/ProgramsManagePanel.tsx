"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { PublishStatusIcon } from "@orgframe/ui/primitives/publish-status-icon";
import { Select } from "@orgframe/ui/primitives/select";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { AssetTile } from "@orgframe/ui/primitives/asset-tile";
import { useToast } from "@orgframe/ui/primitives/toast";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { createProgramAction, duplicateProgramAction, updateProgramAction } from "@/src/features/programs/actions";
import type { Program } from "@/src/features/programs/types";

type ProgramsManagePanelProps = {
  orgSlug: string;
  programs: Program[];
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

export function ProgramsManagePanel({ orgSlug, programs, canWrite = true }: ProgramsManagePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isTogglingStatus, startTogglingStatus] = useTransition();
  const [isDuplicating, startDuplicating] = useTransition();
  const [statusProgramId, setStatusProgramId] = useState<string | null>(null);
  const [duplicateProgramId, setDuplicateProgramId] = useState<string | null>(null);
  const [programItems, setProgramItems] = useState(programs);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [programType, setProgramType] = useState<"league" | "season" | "clinic" | "custom">("season");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [coverImagePath, setCoverImagePath] = useState("");

  useEffect(() => {
    setProgramItems(programs);
  }, [programs]);

  const sortedPrograms = useMemo(() => {
    return [...programItems].sort((a, b) => a.name.localeCompare(b.name));
  }, [programItems]);

  function toggleProgramStatus(program: Program) {
    if (!canWrite) {
      return;
    }

    setStatusProgramId(program.id);
    startTogglingStatus(async () => {
      try {
        const isPublished = program.status === "published";
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

        setProgramItems((current) =>
          current.map((item) =>
            item.id === program.id
              ? {
                  ...item,
                  status: isPublished ? "draft" : "published"
                }
              : item
          )
        );
        toast({
          title: isPublished ? "Program unpublished" : "Program published",
          variant: "success"
        });
      } finally {
        setStatusProgramId(null);
      }
    });
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite) {
      return;
    }

    const resolvedSlug = slug || slugify(name);
    if (!resolvedSlug) {
      toast({
        title: "Missing slug",
        description: "Provide a program name or slug.",
        variant: "destructive"
      });
      return;
    }

    startSaving(async () => {
      const result = await createProgramAction({
        orgSlug,
        slug: resolvedSlug,
        name,
        description,
        programType,
        customTypeLabel,
        status,
        startDate,
        endDate,
        coverImagePath,
        registrationOpenAt: undefined,
        registrationCloseAt: undefined
      });

      if (!result.ok) {
        toast({
          title: "Unable to create program",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Program created",
        variant: "success"
      });
      setIsCreateOpen(false);
      setName("");
      setSlug("");
      setDescription("");
      setCustomTypeLabel("");
      setStatus("draft");
      setProgramType("season");
      setStartDate("");
      setEndDate("");
      setCoverImagePath("");
      router.push(`/tools/programs/${result.data.programId}`);
    });
  }

  function handleDuplicate(program: Program) {
    if (!canWrite) {
      return;
    }

    setDuplicateProgramId(program.id);
    startDuplicating(async () => {
      try {
        const result = await duplicateProgramAction({
          orgSlug,
          programId: program.id
        });

        if (!result.ok) {
          toast({
            title: "Unable to duplicate program",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        toast({
          title: "Program duplicated",
          variant: "success"
        });
        router.push(`/tools/programs/${result.data.programId}`);
      } finally {
        setDuplicateProgramId(null);
      }
    });
  }

  return (
    <div className="ui-stack-page">
      <WorkspaceCardShell
        actions={
          <Button disabled={!canWrite} onClick={() => setIsCreateOpen(true)} type="button">
            <Plus className="h-4 w-4" />
            Create program
          </Button>
        }
        contentClassName="ui-list-stack"
        description="Manage program structure, schedules, and linked forms."
        title="Programs"
      >
        {sortedPrograms.length === 0 ? <Alert variant="info">No programs yet.</Alert> : null}
        {sortedPrograms.map((program) => (
          <div className="ui-list-row ui-list-row-hover" key={program.id}>
            <div className="ui-list-row-content">
              <div className="flex items-center gap-1.5">
                <PublishStatusIcon
                  disabled={!canWrite}
                  isLoading={isTogglingStatus && statusProgramId === program.id}
                  isPublished={program.status === "published"}
                  onToggle={() => toggleProgramStatus(program)}
                  statusLabel={program.status === "published" ? `Published status for ${program.name}` : `Unpublished status for ${program.name}`}
                />
                <Link className="ui-list-row-title hover:underline" href={`/tools/programs/${program.id}`}>
                  {program.name}
                </Link>
              </div>
              <p className="ui-list-row-meta">
                {program.programType === "custom" ? program.customTypeLabel ?? "Custom" : program.programType} · {program.status}
              </p>
              <p className="text-sm text-text-muted">/{orgSlug}/programs/{program.slug}</p>
            </div>
            <div className="ui-list-row-actions">
              <Button href={`/tools/programs/${program.id}`} size="sm" variant="secondary">
                Open
              </Button>
              <Button
                disabled={!canWrite || (isDuplicating && duplicateProgramId !== program.id)}
                loading={isDuplicating && duplicateProgramId === program.id}
                onClick={() => handleDuplicate(program)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </Button>
            </div>
          </div>
        ))}
      </WorkspaceCardShell>

      <Popup
        footer={
          <>
            <Button onClick={() => setIsCreateOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSaving || !canWrite} form="create-program-form" loading={isSaving} type="submit">
              {isSaving ? "Saving..." : "Create program"}
            </Button>
          </>
        }
        onClose={() => setIsCreateOpen(false)}
        open={isCreateOpen}
        size="lg"
        subtitle="Set up leagues, seasons, clinics, and custom programs."
        title="Create program"
      >
        <form className="grid gap-4" id="create-program-form" onSubmit={handleCreate}>
          <FormField label="Program name">
            <Input disabled={!canWrite} onChange={(event) => setName(event.target.value)} required value={name} />
          </FormField>
          <FormField hint="Auto-generated from name if blank." label="Slug">
            <Input
              disabled={!canWrite}
              onChange={(event) => setSlug(slugify(event.target.value))}
              onSlugAutoChange={setSlug}
              slugAutoSource={name}
              slugValidation={{
                kind: "program",
                orgSlug
              }}
              value={slug}
            />
          </FormField>
          <FormField label="Type">
            <Select
              disabled={!canWrite}
              onChange={(event) => setProgramType(event.target.value as "league" | "season" | "clinic" | "custom")}
              options={[
                { value: "league", label: "League" },
                { value: "season", label: "Season" },
                { value: "clinic", label: "Clinic" },
                { value: "custom", label: "Custom" }
              ]}
              value={programType}
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
          {programType === "custom" ? (
            <FormField label="Custom type label">
              <Input disabled={!canWrite} onChange={(event) => setCustomTypeLabel(event.target.value)} required value={customTypeLabel} />
            </FormField>
          ) : null}
          <FormField label="Description">
            <Textarea className="min-h-[90px]" disabled={!canWrite} onChange={(event) => setDescription(event.target.value)} value={description} />
          </FormField>
          <FormField label="Cover photo">
            <AssetTile
              constraints={{
                accept: "image/*,.svg",
                maxSizeMB: 10,
                aspect: "wide",
                recommendedPx: {
                  w: 1600,
                  h: 900
                }
              }}
              disabled={!canWrite}
              fit="cover"
              initialPath={coverImagePath || null}
              initialUrl={getOrgAssetPublicUrl(coverImagePath)}
              kind="org"
              onChange={(asset) => setCoverImagePath(asset.path)}
              onRemove={() => setCoverImagePath("")}
              orgSlug={orgSlug}
              purpose="program-cover"
              specificationText="PNG, JPG, WEBP, HEIC, or SVG"
              title="Program cover"
            />
          </FormField>
          <FormField label="Start date">
            <CalendarPicker disabled={!canWrite} onChange={setStartDate} value={startDate} />
          </FormField>
          <FormField label="End date">
            <CalendarPicker disabled={!canWrite} onChange={setEndDate} value={endDate} />
          </FormField>
        </form>
      </Popup>
    </div>
  );
}
