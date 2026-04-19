import { redirect } from "next/navigation";
import { isOrgToolEnabled, type OrgToolAvailability, type OrgToolKey } from "@/src/shared/org/features";

export function requireOrgToolEnabled(toolAvailability: OrgToolAvailability, tool: OrgToolKey, reason?: string) {
  if (isOrgToolEnabled(toolAvailability, tool)) {
    return;
  }

  redirect(`/forbidden?reason=${encodeURIComponent(reason ?? `tool-disabled-${tool}`)}`);
}
