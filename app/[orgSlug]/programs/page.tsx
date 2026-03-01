import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { listPublishedProgramsForCatalog } from "@/modules/programs/db/queries";

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
    <main className="w-full px-6 py-8 md:px-8 md:py-10">
      <div className="space-y-6">
        <PageHeader description="Browse active programs and open registration details." title="Programs" />

        {programs.length === 0 ? <Alert variant="info">No published programs yet.</Alert> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <Card key={program.id}>
              {program.coverImagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`${program.name} cover`}
                  className="h-44 w-full rounded-t-card object-cover"
                  src={getOrgAssetPublicUrl(program.coverImagePath) ?? ""}
                />
              ) : null}
              <CardHeader>
                <CardTitle>{program.name}</CardTitle>
                <CardDescription>
                  {labelProgramType(program.programType, program.customTypeLabel)} · {formatDateRange(program.startDate, program.endDate)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-text-muted">{program.description ?? "Program details are available on the next page."}</p>
                <Link className={buttonVariants({ variant: "secondary" })} href={`/${org.orgSlug}/programs/${program.slug}`}>
                  View program
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
