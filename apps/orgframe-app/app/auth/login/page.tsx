import { redirect } from "next/navigation";

export default async function LegacyLoginPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string; next?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();

  if (query.mode) params.set("mode", query.mode);
  if (query.error) params.set("error", query.error);
  if (query.message) params.set("message", query.message);
  if (query.next) params.set("next", query.next);

  const suffix = params.toString();
  redirect(suffix ? `/auth?${suffix}` : "/auth");
}
