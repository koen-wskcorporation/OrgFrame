import { redirect } from "next/navigation";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled, type OrgToolKey } from "@/src/features/core/config/tools";
import type { Permission } from "@/src/features/core/access";
import type { OrgAuthContext } from "@/src/shared/org/types";

type GateOptions = {
  /** Single permission required, or an array meaning "any of these". */
  permission: Permission | Permission[];
  /** Optional tool flag. If set and the tool is disabled, returns `unavailable: true`. */
  tool?: OrgToolKey;
};

type GateResult = {
  orgContext: OrgAuthContext;
  unavailable: boolean;
};

export async function gateManageSection(orgSlug: string, { permission, tool }: GateOptions): Promise<GateResult> {
  const orgContext = await getOrgAuthContext(orgSlug);
  const required = Array.isArray(permission) ? permission : [permission];
  const granted = required.some((p) => can(orgContext.membershipPermissions, p));
  if (!granted) {
    redirect("/forbidden");
  }
  const unavailable = tool ? !isOrgToolEnabled(orgContext.toolAvailability, tool) : false;
  return { orgContext, unavailable };
}
