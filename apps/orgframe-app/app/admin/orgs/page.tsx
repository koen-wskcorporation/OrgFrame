import { createDataApiServiceRoleClient } from "@/src/shared/data-api/server";
import { requirePlatformAdmin } from "@/src/shared/auth/requirePlatformAdmin";
import {
  ORG_TOOLS,
  orgToolKeys,
  resolveOrgToolAvailability
} from "@/src/features/core/config/tools";
import { OrgFeaturesForm } from "./OrgFeaturesForm";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage() {
  await requirePlatformAdmin();

  const supabase = createDataApiServiceRoleClient();
  const { data, error } = await supabase
    .schema("orgs")
    .from("orgs")
    .select("id, slug, name, features_json")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load orgs: ${error.message}`);
  }

  const orgs = (data ?? []).map((org) => ({
    id: org.id as string,
    slug: org.slug as string,
    name: org.name as string,
    availability: resolveOrgToolAvailability(org.features_json)
  }));

  const tools = orgToolKeys.map((key) => ({ key, label: ORG_TOOLS[key].label }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Organization tools</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Toggle which tools each org can see and use. Disabled tools are hidden from navigation
          and blocked at the page and server-action level.
        </p>
      </div>

      {orgs.length === 0 ? (
        <p className="text-sm text-neutral-500">No orgs found.</p>
      ) : (
        <div className="space-y-4">
          {orgs.map((org) => (
            <OrgFeaturesForm
              key={org.id}
              orgId={org.id}
              orgName={org.name}
              orgSlug={org.slug}
              tools={tools}
              availability={org.availability}
            />
          ))}
        </div>
      )}
    </div>
  );
}
