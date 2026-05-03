"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { ItemPageHeader } from "@orgframe/ui/primitives/item-page-header";
import { StatusChipPicker } from "@orgframe/ui/primitives/status-chip-picker";
import { useToast } from "@orgframe/ui/primitives/toast";
import { updateProgramAction } from "@/src/features/programs/actions";
import { ProgramCreateWizard } from "@/src/features/programs/components/ProgramCreateWizard";
import type { Program } from "@/src/features/programs/types";

type ProgramItemShellProps = {
  orgSlug: string;
  initialProgram: Program;
  canWrite: boolean;
  /** Tabs nav rendered inside the page header — collapses on scroll. */
  tabs?: React.ReactNode;
  children: React.ReactNode;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "published", label: "Published", color: "emerald" },
  { value: "archived", label: "Archived", color: "rose" }
];

export function ProgramItemShell({ orgSlug, initialProgram, canWrite, tabs, children }: ProgramItemShellProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [program, setProgram] = React.useState(initialProgram);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setProgram(initialProgram);
  }, [initialProgram]);

  async function handleStatusChange(next: string) {
    if (!canWrite || next === program.status) return;
    const previous = program.status;
    const status = next as Program["status"];
    setProgram((current) => ({ ...current, status }));
    setPending(true);
    const result = await updateProgramAction({
      orgSlug,
      programId: program.id,
      slug: program.slug,
      name: program.name,
      description: program.description ?? undefined,
      programType: program.programType,
      customTypeLabel: program.customTypeLabel ?? undefined,
      status,
      startDate: program.startDate ?? undefined,
      endDate: program.endDate ?? undefined,
      coverImagePath: program.coverImagePath ?? undefined,
      registrationOpenAt: program.registrationOpenAt ?? undefined,
      registrationCloseAt: program.registrationCloseAt ?? undefined
    });
    setPending(false);
    if (!result.ok) {
      setProgram((current) => ({ ...current, status: previous }));
      toast({ title: "Couldn't change status", description: result.error, variant: "destructive" });
      return;
    }
    router.refresh();
  }

  return (
    <>
      <ItemPageHeader
        title={program.name}
        status={
          <StatusChipPicker
            disabled={!canWrite || pending}
            onChange={handleStatusChange}
            options={STATUS_OPTIONS}
            value={program.status}
          />
        }
        actions={
          <Button onClick={() => setSettingsOpen(true)} variant="secondary">
            <Settings2 className="h-4 w-4" />
            Settings
          </Button>
        }
        tabs={tabs}
      />

      {children}

      <ProgramCreateWizard
        canWrite={canWrite}
        existingProgram={{
          id: program.id,
          name: program.name,
          slug: program.slug,
          programType: program.programType,
          customTypeLabel: program.customTypeLabel,
          status: program.status,
          description: program.description,
          coverImagePath: program.coverImagePath,
          startDate: program.startDate,
          endDate: program.endDate
        }}
        onClose={() => setSettingsOpen(false)}
        onSubmit={async (input) => {
          const result = await updateProgramAction({
            orgSlug,
            programId: program.id,
            slug: input.slug,
            name: input.name,
            description: input.description || undefined,
            programType: input.programType,
            customTypeLabel: input.customTypeLabel || undefined,
            status: input.status,
            startDate: input.startDate || undefined,
            endDate: input.endDate || undefined,
            coverImagePath: input.coverImagePath || undefined,
            registrationOpenAt: program.registrationOpenAt ?? undefined,
            registrationCloseAt: program.registrationCloseAt ?? undefined
          });
          if (!result.ok) {
            toast({ title: "Couldn't save", description: result.error, variant: "destructive" });
            return { ok: false, message: result.error };
          }
          toast({ title: "Program saved", variant: "success" });
          if (input.slug !== program.slug) {
            router.replace(`/${orgSlug}/manage/programs/${result.data.programId}`);
          } else {
            router.refresh();
          }
          return { ok: true };
        }}
        open={settingsOpen}
        orgSlug={orgSlug}
      />
    </>
  );
}
