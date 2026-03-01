import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { resolveOrgRolePermissions } from "@/lib/org/customRoles";
import { can } from "@/lib/permissions/can";
import type { OrgRole, Permission } from "@/modules/core/access";
import type { AiResolvedContext, AiResolvedOrg } from "@/modules/ai/types";

async function resolveOrgBySlug(orgSlug: string): Promise<AiResolvedOrg | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("orgs").select("id, slug, name").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve organization: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    orgId: data.id,
    orgSlug: data.slug,
    orgName: data.name
  };
}

async function resolveOrgPermissions(orgId: string, userId: string): Promise<Permission[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return [];
  }

  return resolveOrgRolePermissions(supabase, orgId, data.role as OrgRole);
}

export async function resolveAiContext(orgSlug?: string): Promise<AiResolvedContext | null> {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return null;
  }

  if (!orgSlug) {
    return {
      userId: sessionUser.id,
      email: sessionUser.email,
      org: null,
      permissionEnvelope: {
        permissions: [],
        canExecuteOrgActions: false,
        canReadOrg: false
      }
    };
  }

  const org = await resolveOrgBySlug(orgSlug);

  if (!org) {
    return {
      userId: sessionUser.id,
      email: sessionUser.email,
      org: null,
      permissionEnvelope: {
        permissions: [],
        canExecuteOrgActions: false,
        canReadOrg: false
      }
    };
  }

  const permissions = await resolveOrgPermissions(org.orgId, sessionUser.id);

  return {
    userId: sessionUser.id,
    email: sessionUser.email,
    org,
    permissionEnvelope: {
      permissions,
      canExecuteOrgActions: can(permissions, "org.branding.write") || can(permissions, "forms.write"),
      canReadOrg: can(permissions, ["org.dashboard.read"])
    }
  };
}
