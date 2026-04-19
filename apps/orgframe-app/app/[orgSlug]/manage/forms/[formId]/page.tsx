import { redirect } from "next/navigation";

export default async function OrgToolsFormDetailPage({
  params
}: {
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  const { orgSlug, formId } = await params;
  redirect(`/manage/forms/${formId}/editor`);
}
