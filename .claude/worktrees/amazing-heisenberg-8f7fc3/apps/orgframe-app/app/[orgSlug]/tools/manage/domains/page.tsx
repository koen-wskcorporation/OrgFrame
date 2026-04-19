import { redirectLegacyRoute } from "../../../legacy-route-utils";

export default async function OrgToolsManageDomainsLegacyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  await redirectLegacyRoute({
    params,
    pathname: "/tools/domains"
  });
}
