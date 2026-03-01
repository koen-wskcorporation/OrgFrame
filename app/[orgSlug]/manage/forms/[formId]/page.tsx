import { redirect } from "next/navigation";

export default async function OrgManageFormDetailPage({
  params
}: {
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  const { orgSlug, formId } = await params;
  redirect(`/${orgSlug}/tools/forms/${formId}/editor`);
}
