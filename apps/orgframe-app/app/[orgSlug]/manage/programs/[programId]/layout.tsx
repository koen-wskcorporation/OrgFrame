import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
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
    <PageStack>
      <PageHeader
        description="Program structure map is deferred in this phase."
        showBorder={false}
        title="Program"
      />
      <ProgramTabsNav orgSlug={orgSlug} programId={programId} />
      {children}
    </PageStack>
  );
}
