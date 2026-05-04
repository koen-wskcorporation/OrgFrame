import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ProgramTabsNav } from "./ProgramTabsNav";

export default async function ProgramManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  return (
    <ManagePageShell
      description="Program structure map is deferred in this phase."
      tabs={<ProgramTabsNav orgSlug={orgSlug} programId={programId} />}
      title="Program"
    >
      {children}
    </ManagePageShell>
  );
}
