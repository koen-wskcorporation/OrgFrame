import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { getFacilityById } from "@/modules/facilities/db/queries";

export const metadata: Metadata = {
  title: "Edit Facility"
};

export default async function FacilityEditorWorkspaceScreen({
  params
}: {
  params: Promise<{ orgSlug: string; facilityId: string }>;
}) {
  const { orgSlug, facilityId } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  if (!can(orgContext.membershipPermissions, "spaces.write")) {
    redirect("/forbidden");
  }

  const facility = await getFacilityById(orgContext.orgId, facilityId);

  if (!facility) {
    notFound();
  }

  redirect(`/${orgContext.orgSlug}/workspace/facilities/${facility.id}?editMap=1`);
}
