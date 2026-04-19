import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CenteredFormShell } from "@/src/features/core/layout/components/CenteredFormShell";
import { CreateOrganizationForm } from "@/src/features/core/dashboard/components/CreateOrganizationForm";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";

export const metadata: Metadata = {
  title: "Create organization"
};

export default async function CreateOrganizationPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth?next=/create");
  }

  return (
    <CenteredFormShell subtitle="Set up a workspace to start managing your programs, events, and members." title="Create your organization">
      <CreateOrganizationForm />
      <p className="mt-5 text-center text-sm text-text-muted">
        Already have a workspace?{" "}
        <Link className="font-medium text-text underline underline-offset-2 hover:text-text-muted" href="/">
          Back to dashboard
        </Link>
      </p>
    </CenteredFormShell>
  );
}
