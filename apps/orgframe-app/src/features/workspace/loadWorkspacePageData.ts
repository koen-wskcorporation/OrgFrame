import { can } from "@/src/shared/permissions/can";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getWorkspaceImportData, getWorkspaceOverviewData, listWorkspacePendingActions } from "@/src/features/workspace/server";

export async function loadWorkspacePageData(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  const importData = await getWorkspaceImportData({ orgSlug: orgContext.orgSlug });
  const pendingActions = await listWorkspacePendingActions({
    orgId: orgContext.orgId,
    limit: 25,
  });
  const overview = await getWorkspaceOverviewData({
    orgId: orgContext.orgId,
    importData,
    pendingActions,
  });

  return {
    orgContext,
    importData,
    pendingActions,
    overview,
    canAccessImports: importData.canAccess && can(orgContext.membershipPermissions, "org.manage.read"),
  };
}
