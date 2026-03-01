import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { RegistrationFormClient } from "@/modules/forms/components/RegistrationFormClient";
import { getFormBySlug } from "@/modules/forms/db/queries";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { listPlayersForPicker } from "@/modules/players/db/queries";
import { listProgramNodes } from "@/modules/programs/db/queries";

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ orgSlug: string; formSlug: string }>;
}): Promise<Metadata> {
  const { formSlug } = await params;
  return {
    title: `${titleFromSlug(formSlug) || "Form"} Registration`
  };
}

export default async function OrgFormRegistrationPage({
  params
}: {
  params: Promise<{ orgSlug: string; formSlug: string }>;
}) {
  const { orgSlug, formSlug } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const form = await getFormBySlug(org.orgId, formSlug, {
    includeDraft: false
  });

  if (!form) {
    notFound();
  }

  const user = await getSessionUser();
  const requireSignIn = form.settingsJson.requireSignIn !== false;

  if (requireSignIn && !user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/${org.orgSlug}/register/${form.slug}`)}`);
  }

  const [players, programNodes] = await Promise.all([
    user ? listPlayersForPicker(user.id) : Promise.resolve([]),
    form.formKind === "program_registration" && form.programId ? listProgramNodes(form.programId, { publishedOnly: true }) : Promise.resolve([])
  ]);

  return (
    <main className="w-full px-6 py-8 md:px-8 md:py-10">
      <div className="space-y-6">
        <PageHeader description={form.description ?? "Complete the form and submit registration."} title={form.name} />

        {form.formKind === "program_registration" && players.length === 0 ? (
          <Alert variant="info">No players found yet. Add one in the form below before submitting.</Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Registration form</CardTitle>
            <CardDescription>{user ? `Signed in as ${user.email ?? "your account"}.` : "You can submit without signing in."}</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationFormClient form={form} formSlug={form.slug} orgSlug={org.orgSlug} players={players} programNodes={programNodes} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
