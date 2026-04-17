import { z } from "zod";
import type { DashboardUserPreferences, PersonalHubModuleKey } from "@/src/features/core/dashboard/types-v2";
import { personalHubModuleKeys } from "@/src/features/core/dashboard/types-v2";

const moduleKeySchema = z.enum(personalHubModuleKeys);

const preferencesSchema = z.object({
  hiddenModules: z.array(moduleKeySchema).default([]),
  moduleOrder: z.array(moduleKeySchema).default([...personalHubModuleKeys]),
  pinnedOrgIds: z.array(z.string().uuid()).default([]),
  orgOrder: z.array(z.string().uuid()).default([]),
  compactMode: z.boolean().default(false)
});

export const defaultDashboardUserPreferences: DashboardUserPreferences = {
  hiddenModules: [],
  moduleOrder: [...personalHubModuleKeys],
  pinnedOrgIds: [],
  orgOrder: [],
  compactMode: false
};

function uniqueModules(values: PersonalHubModuleKey[]) {
  return Array.from(new Set(values));
}

function mergeModuleOrder(preferred: PersonalHubModuleKey[]) {
  const deduped = uniqueModules(preferred);
  const tail = personalHubModuleKeys.filter((key) => !deduped.includes(key));
  return [...deduped, ...tail];
}

export function normalizeDashboardUserPreferences(raw: unknown, orgIds: string[] = []): DashboardUserPreferences {
  const parsed = preferencesSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : defaultDashboardUserPreferences;
  const orgIdSet = new Set(orgIds);

  return {
    hiddenModules: uniqueModules(base.hiddenModules),
    moduleOrder: mergeModuleOrder(base.moduleOrder),
    pinnedOrgIds: Array.from(new Set(base.pinnedOrgIds.filter((orgId) => orgIdSet.size === 0 || orgIdSet.has(orgId)))),
    orgOrder: Array.from(new Set(base.orgOrder.filter((orgId) => orgIdSet.size === 0 || orgIdSet.has(orgId)))),
    compactMode: Boolean(base.compactMode)
  };
}

export function serializeDashboardUserPreferences(preferences: DashboardUserPreferences) {
  return {
    hiddenModules: uniqueModules(preferences.hiddenModules),
    moduleOrder: mergeModuleOrder(preferences.moduleOrder),
    pinnedOrgIds: Array.from(new Set(preferences.pinnedOrgIds)),
    orgOrder: Array.from(new Set(preferences.orgOrder)),
    compactMode: Boolean(preferences.compactMode)
  };
}

export function parseDashboardUserPreferencesPayload(raw: unknown, orgIds: string[] = []) {
  return normalizeDashboardUserPreferences(raw, orgIds);
}
