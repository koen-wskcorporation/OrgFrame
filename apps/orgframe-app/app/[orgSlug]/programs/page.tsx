import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";
import { listPublishedProgramsForCatalog } from "@/src/features/programs/db/queries";
import { ProgramsCatalogRepeater } from "./ProgramsCatalogRepeater";

export const metadata: Metadata = {
  title: "Programs"
};

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }

  if (startDate) {
    return `Starts ${startDate}`;
  }

  if (endDate) {
    return `Ends ${endDate}`;
  }

  return "Dates to be announced";
}

function labelProgramType(programType: string, customTypeLabel: string | null) {
  if (programType === "custom") {
    return customTypeLabel ?? "Custom";
  }

  return programType.charAt(0).toUpperCase() + programType.slice(1);
}

export default async function OrgProgramsCatalogPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const programs = await listPublishedProgramsForCatalog(org.orgId);

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader description="Browse active programs and open registration details." title="Programs" />

        {programs.length === 0 ? <Alert variant="info">No published programs yet.</Alert> : null}

        {programs.length > 0 ? (
          <ProgramsCatalogRepeater
            items={programs.map((program) => ({
              coverImageUrl: program.coverImagePath ? getOrgAssetPublicUrl(program.coverImagePath) ?? null : null,
              dateLabel: formatDateRange(program.startDate, program.endDate),
              description: program.description,
              href: `/${org.orgSlug}/programs/${program.slug}`,
              id: program.id,
              name: program.name,
              slug: program.slug,
              typeLabel: labelProgramType(program.programType, program.customTypeLabel)
            }))}
          />
        ) : null}
      </div>
    </main>
  );
}
