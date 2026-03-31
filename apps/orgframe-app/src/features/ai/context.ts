import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { can } from "@/src/shared/permissions/can";
import type { OrgRole, Permission } from "@/src/features/core/access";
import type { AiResolvedContext, AiResolvedOrg } from "@/src/features/ai/types";

function buildDefaultContext(input: { userId: string; email: string | null; org: AiResolvedOrg | null; permissions: Permission[] }): AiResolvedContext {
  const { userId, email, org, permissions } = input;
  return {
    userId,
    email,
    org,
    account: {
      activePlayerId: null,
      players: []
    },
    scope: {
      currentModule: "unknown"
    },
    permissionEnvelope: {
      permissions,
      canExecuteOrgActions: Boolean(org) && (can(permissions, "org.branding.write") || can(permissions, "forms.write")),
      canReadOrg: Boolean(org) && can(permissions, ["org.dashboard.read"])
    }
  };
}

async function resolveOrgBySlug(orgSlug: string): Promise<AiResolvedOrg | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("orgs").select("id, slug, name").eq("slug", orgSlug).maybeSingle();

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
    .schema("orgs").from("org_memberships")
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
    return buildDefaultContext({
      userId: sessionUser.id,
      email: sessionUser.email,
      org: null,
      permissions: []
    });
  }

  const org = await resolveOrgBySlug(orgSlug);

  if (!org) {
    return buildDefaultContext({
      userId: sessionUser.id,
      email: sessionUser.email,
      org: null,
      permissions: []
    });
  }

  const permissions = await resolveOrgPermissions(org.orgId, sessionUser.id);

  return buildDefaultContext({
    userId: sessionUser.id,
    email: sessionUser.email,
    org,
    permissions
  });
}
