import { redirectLegacyRoute } from "../../legacy-route-utils";

export default async function OrgBillingLegacyPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyRoute({
    params,
    pathname: "/tools/payments/settings",
    searchParams,
    allowedSearchParams: ["connect"]
  });
}
