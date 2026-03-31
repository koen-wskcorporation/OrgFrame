import { redirectLegacyRoute, type LegacySearchParams } from "../../legacy-route-utils";

export default async function OrgManageSegmentsRedirectPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string; segments: string[] }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const { segments } = await params;
  const suffix = segments.length > 0 ? `/${segments.join("/")}` : "";

  await redirectLegacyRoute({
    params,
    pathname: `/tools${suffix}`,
    searchParams
  });
}
