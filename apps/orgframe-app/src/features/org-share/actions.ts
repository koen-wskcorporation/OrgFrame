"use server";

import { z } from "zod";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { listOrgShareCatalog } from "@/src/features/org-share/server";
import type { ShareTarget, ShareTargetType } from "@/src/features/org-share/types";

const listCatalogSchema = z.object({
  orgSlug: z.string().trim().min(1),
  requestedTypes: z.array(z.enum(["team", "division", "program", "person", "admin", "group"])).optional()
});

type OrgShareActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): OrgShareActionResult<never> {
  return {
    ok: false,
    error
  };
}

export async function listOrgShareCatalogAction(
  input: z.input<typeof listCatalogSchema>
): Promise<OrgShareActionResult<{ options: ShareTarget[] }>> {
  const parsed = listCatalogSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid share catalog request.");
  }

  try {
    const org = await getOrgAuthContext(parsed.data.orgSlug);
    const requestedTypes = parsed.data.requestedTypes;

    const canReadPeople = can(org.membershipPermissions, "people.read") || can(org.membershipPermissions, "org.manage.read");
    const canReadPrograms =
      can(org.membershipPermissions, "programs.read")
      || can(org.membershipPermissions, "programs.write")
      || can(org.membershipPermissions, "calendar.read")
      || can(org.membershipPermissions, "calendar.write")
      || can(org.membershipPermissions, "org.manage.read");

    const requestedTypeSet = requestedTypes && requestedTypes.length > 0 ? new Set<ShareTargetType>(requestedTypes) : null;

    const includePeopleAndGroups =
      !requestedTypeSet
      || requestedTypeSet.has("person")
      || requestedTypeSet.has("admin")
      || requestedTypeSet.has("group")
        ? canReadPeople
        : false;

    const includeHierarchy =
      !requestedTypeSet
      || requestedTypeSet.has("team")
      || requestedTypeSet.has("division")
      || requestedTypeSet.has("program")
        ? canReadPrograms
        : false;

    const options = await listOrgShareCatalog({
      orgId: org.orgId,
      requestedTypes,
      includePeopleAndGroups,
      includeHierarchy
    });

    return {
      ok: true,
      data: {
        options
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Always log on the server so the underlying failure (RLS, schema, FK
    // resolution, etc.) is visible in the Next.js terminal regardless of
    // environment. The generic message goes to the user in production; the
    // real one helps diagnose in development.
    console.error("listOrgShareCatalogAction failed", {
      orgSlug: parsed.data.orgSlug,
      requestedTypes: parsed.data.requestedTypes,
      error: message
    });
    if (process.env.NODE_ENV !== "production") {
      return asError(`Unable to load sharing recipients: ${message}`);
    }
    return asError("Unable to load sharing recipients right now.");
  }
}
