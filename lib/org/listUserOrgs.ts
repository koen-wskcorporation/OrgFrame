import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import type { OrgRole } from "@/modules/core/access";

export type UserOrgMembership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  logoPath: string | null;
  iconPath: string | null;
};

export async function listUserOrgs(): Promise<UserOrgMembership[]> {
  const user = await getSessionUser();

  if (!user) {
    return [];
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_memberships")
    .select("role, org:orgs!inner(id, slug, name, logo_path, icon_path)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list user orgs: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const nestedOrg = row.org as
      | { id: string; slug: string; name: string; logo_path?: string | null; icon_path?: string | null }
      | { id: string; slug: string; name: string; logo_path?: string | null; icon_path?: string | null }[]
      | null;
    const org = Array.isArray(nestedOrg) ? nestedOrg[0] : nestedOrg;

    if (!org) {
      return [];
    }

    return [
      {
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        role: row.role as OrgRole,
        logoPath: org.logo_path ?? null,
        iconPath: org.icon_path ?? null
      }
    ];
  });
}
