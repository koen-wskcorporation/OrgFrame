import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { FormEditorPanel } from "@/src/features/forms/components/FormEditorPanel";
import { getFormByIdCached } from "@/src/features/forms/cached-loaders";
import { listProgramNodes, listProgramsForManage } from "@/src/features/programs/db/queries";

export const metadata: Metadata = {
  title: "Form Builder"
};

export default async function OrgManageFormEditorPage({
  params
}: {
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  const { orgSlug, formId } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["forms.read", "forms.write"],
    tool: "forms"
  });
  if (unavailable) return null;

  const form = await getFormByIdCached(orgContext.orgId, formId);
  if (!form) notFound();

  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const canAccessPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");
  const [programs, programNodes] = await Promise.all([
    canAccessPrograms ? listProgramsForManage(orgContext.orgId) : Promise.resolve([]),
    canAccessPrograms && form.programId ? listProgramNodes(form.programId) : Promise.resolve([])
  ]);

  return <FormEditorPanel canWrite={canWriteForms} form={form} orgSlug={orgSlug} programNodes={programNodes} programs={programs} />;
}
