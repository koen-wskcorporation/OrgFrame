import { redirectLegacyRoute } from "../../../legacy-route-utils";

export default async function OrgToolsManageSportsConnectLegacyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  await redirectLegacyRoute({
    params,
    pathname: "/tools/imports"
  });
}
