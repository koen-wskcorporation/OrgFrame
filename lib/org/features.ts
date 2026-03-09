export type OrgFeatureKey = "website" | "programs" | "calendar" | "facilities" | "forms";

export type OrgFeatureSetting = {
  enabled: boolean;
};

export type OrgFeatures = Record<OrgFeatureKey, OrgFeatureSetting>;

export type OrgFeatureDefinition = {
  key: OrgFeatureKey;
  label: string;
  description: string;
};

export const orgFeatureDefinitions: OrgFeatureDefinition[] = [
  {
    key: "website",
    label: "Website",
    description: "Enable public pages, page editing, and website navigation for this org."
  },
  {
    key: "programs",
    label: "Programs",
    description: "Manage program catalogs, divisions, teams, and registrations."
  },
  {
    key: "calendar",
    label: "Calendar",
    description: "Run shared scheduling for practices, games, events, and calendar views."
  },
  {
    key: "facilities",
    label: "Facilities",
    description: "Manage facilities, nested spaces, and booking-aware maps."
  },
  {
    key: "forms",
    label: "Forms",
    description: "Build org forms and operate submissions."
  }
];

const defaultOrgFeatures = Object.freeze(
  orgFeatureDefinitions.reduce(
    (acc, feature) => {
      acc[feature.key] = { enabled: true };
      return acc;
    },
    {} as OrgFeatures
  )
);

export function normalizeOrgFeatures(value: unknown): OrgFeatures {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaultOrgFeatures };
  }

  const record = value as Record<string, unknown>;
  const normalized = { ...defaultOrgFeatures };

  for (const feature of orgFeatureDefinitions) {
    const rawValue = record[feature.key];

    if (typeof rawValue === "boolean") {
      normalized[feature.key] = { enabled: rawValue };
      continue;
    }

    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const enabled = (rawValue as { enabled?: unknown }).enabled;
      normalized[feature.key] = { enabled: enabled !== false };
    }
  }

  return normalized;
}

export function isOrgFeatureEnabled(features: OrgFeatures, key: OrgFeatureKey) {
  return features[key]?.enabled !== false;
}
