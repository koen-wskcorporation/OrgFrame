"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { RepeaterChip } from "@orgframe/ui/primitives/chip";
import { PublishStatusIcon } from "@orgframe/ui/primitives/publish-status-icon";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { useToast } from "@orgframe/ui/primitives/toast";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { createProgramAction, duplicateProgramAction, updateProgramAction } from "@/src/features/programs/actions";
import { ProgramCreateWizard, type ProgramCreateInput } from "@/src/features/programs/components/ProgramCreateWizard";
import type { Program } from "@/src/features/programs/types";

type ProgramsManagePanelProps = {
  orgSlug: string;
  orgDisplayHost: string;
  programs: Program[];
  canWrite?: boolean;
};

export function ProgramsManagePanel({ orgSlug, orgDisplayHost, programs, canWrite = true }: ProgramsManagePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTogglingStatus, startTogglingStatus] = useTransition();
  const [isDuplicating, startDuplicating] = useTransition();
  const [statusProgramId, setStatusProgramId] = useState<string | null>(null);
  const [duplicateProgramId, setDuplicateProgramId] = useState<string | null>(null);
  const [programItems, setProgramItems] = useState(programs);

  useEffect(() => {
    setProgramItems(programs);
  }, [programs]);

  const sortedPrograms = useMemo(() => {
    return [...programItems].sort((a, b) => a.name.localeCompare(b.name));
  }, [programItems]);

  function toggleProgramStatus(program: Program) {
    if (!canWrite) return;

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
            item.id === program.id ? { ...item, status: isPublished ? "draft" : "published" } : item
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

  async function handleCreate(input: ProgramCreateInput) {
    const result = await createProgramAction({
      orgSlug,
      slug: input.slug,
      name: input.name,
      description: input.description,
      programType: input.programType,
      customTypeLabel: input.customTypeLabel,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      coverImagePath: input.coverImagePath,
      registrationOpenAt: undefined,
      registrationCloseAt: undefined
    });

    if (!result.ok) {
      toast({
        title: "Unable to create program",
        description: result.error,
        variant: "destructive"
      });
      return { ok: false as const, message: result.error };
    }

    toast({ title: "Program created", variant: "success" });
    router.push(`/manage/programs/${result.data.programId}`);
    return { ok: true as const };
  }

  function handleDuplicate(program: Program) {
    if (!canWrite) return;

    setDuplicateProgramId(program.id);
    startDuplicating(async () => {
      try {
        const result = await duplicateProgramAction({ orgSlug, programId: program.id });

        if (!result.ok) {
          toast({
            title: "Unable to duplicate program",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        toast({ title: "Program duplicated", variant: "success" });
        router.push(`/manage/programs/${result.data.programId}`);
      } finally {
        setDuplicateProgramId(null);
      }
    });
  }

  return (
    <>
      <PageShell title="Programs">
        {!canWrite ? <Alert variant="info">You have read-only access to programs.</Alert> : null}
        <Repeater
          emptyMessage="No programs yet."
          getSearchValue={(program) => `${program.name} ${program.slug}`}
          initialView="list"
          items={sortedPrograms}
          searchPlaceholder="Search programs"
          viewKey="manage.programs"
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
              description="Manage program structure, schedules, and linked forms."
              fill={false}
              title="Programs"
            >
              {body}
            </ManageSection>
          )}
          getItem={(program) => ({
              id: program.id,
              title: (
                <Link className="hover:underline" href={`/manage/programs/${program.id}`}>
                  {program.name}
                </Link>
              ),
              chips: (
                <>
                  <PublishStatusIcon
                    disabled={!canWrite}
                    isLoading={isTogglingStatus && statusProgramId === program.id}
                    isPublished={program.status === "published"}
                    onToggle={() => toggleProgramStatus(program)}
                    statusLabel={program.status === "published" ? `Published status for ${program.name}` : `Unpublished status for ${program.name}`}
                  />
                  <RepeaterChip label={program.programType === "custom" ? program.customTypeLabel ?? "Custom" : program.programType} />
                </>
              ),
              meta: <>/{program.slug}</>,
              secondaryActions: (
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
              ),
              primaryAction: (
                <Button href={`/manage/programs/${program.id}`} size="sm" variant="secondary">
                  Open
                </Button>
              )
            })}
        />
      </PageShell>

      <ProgramCreateWizard
        canWrite={canWrite}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
        open={isCreateOpen}
        orgSlug={orgSlug}
      />
    </>
  );
}
