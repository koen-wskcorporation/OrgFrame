import { redirectLegacyRoute } from "../../../legacy-route-utils";

type SearchParams = {
  saved?: string;
  error?: string;
};

export default async function OrgToolsManageBrandingLegacyPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await redirectLegacyRoute({
    params,
    pathname: "/tools/branding",
    searchParams,
    allowedSearchParams: ["saved", "error"]
  });
}
