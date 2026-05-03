import { renderManageSidebarSlot } from "../_render";

export default async function ManageSidebarNested({
  params
}: {
  params: Promise<{ orgSlug: string; rest: string[] }>;
}) {
  const { orgSlug } = await params;
  return renderManageSidebarSlot(orgSlug);
}
