import { redirect } from "next/navigation";

export default async function ProgramAliasPage({
  params
}: {
  params: Promise<{ orgSlug: string; segments?: string[] }>;
}) {
  const { orgSlug, segments } = await params;
  const suffix = Array.isArray(segments) ? segments.join("/") : "";
  const target = suffix ? `/${orgSlug}/programs/${suffix}` : `/${orgSlug}/programs`;
  redirect(target);
}
