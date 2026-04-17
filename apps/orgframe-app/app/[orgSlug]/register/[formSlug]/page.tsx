import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { RegistrationFormClient } from "@/src/features/forms/components/RegistrationFormClient";
import { getFormBySlug } from "@/src/features/forms/db/queries";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";
import { listPlayersForPicker } from "@/src/features/players/db/queries";
import { listProgramNodes } from "@/src/features/programs/db/queries";

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
  const requireSignIn = form.formKind === "program_registration" || form.settingsJson.requireSignIn !== false;

  if (requireSignIn && !user) {
    redirect(`/auth?next=${encodeURIComponent(`/register/${form.slug}`)}`);
  }

  const [players, programNodes] = await Promise.all([
    user ? listPlayersForPicker(user.id) : Promise.resolve([]),
    form.formKind === "program_registration" && form.programId ? listProgramNodes(form.programId, { publishedOnly: true }) : Promise.resolve([])
  ]);

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader description={form.description ?? "Complete the form and submit registration."} title={form.name} />

        {form.formKind === "program_registration" && players.length === 0 ? (
          <Alert variant="info">No players found yet. Add one in the form below before submitting.</Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Registration form</CardTitle>
            <CardDescription>
              {user
                ? `Signed in as ${user.email ?? "your account"}.`
                : requireSignIn
                  ? "Sign in is required to submit this form."
                  : "You can submit without signing in."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationFormClient form={form} formSlug={form.slug} orgSlug={org.orgSlug} players={players} programNodes={programNodes} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
