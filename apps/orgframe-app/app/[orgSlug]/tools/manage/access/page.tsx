import { redirectLegacyRoute } from "../../../legacy-route-utils";

export default async function OrgToolsAccessLegacyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  await redirectLegacyRoute({
    params,
    pathname: "/tools/access"
  });
}
