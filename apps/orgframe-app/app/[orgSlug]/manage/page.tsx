import { redirectLegacyRoute, type LegacySearchParams } from "../legacy-route-utils";

export default async function OrgManageRedirectPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  await redirectLegacyRoute({
    params,
    pathname: "/tools",
    searchParams
  });
}
