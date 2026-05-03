import { renderManageSidebarSlot } from "./_render";

export default async function ManageSidebarRoot({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return renderManageSidebarSlot(orgSlug);
}
