export type OrgTypeOption = {
  value: string;
  label: string;
  description: string;
};

export type ActivityOption = {
  value: string;
  label: string;
  keywords?: string[];
};

export type ThemeColorOption = {
  value: string;
  label: string;
  description: string;
};

export type OrgSizeOption = {
  value: string;
  label: string;
  description: string;
};

export const ORG_TYPE_OPTIONS: OrgTypeOption[] = [
  {
    value: "club",
    label: "Club",
    description: "For community, travel, or competitive organizations."
  },
  {
    value: "league",
    label: "League",
    description: "For leagues coordinating multiple teams or divisions."
  },
  {
    value: "school",
    label: "School",
    description: "For schools, districts, and athletic departments."
  },
  {
    value: "academy",
    label: "Academy",
    description: "For training programs, camps, and player development."
  },
  {
    value: "facility",
    label: "Facility",
    description: "For venues, complexes, and sports performance spaces."
  }
];

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  { value: "baseball", label: "Baseball" },
  { value: "basketball", label: "Basketball" },
  { value: "cheer", label: "Cheer" },
  { value: "dance", label: "Dance" },
  { value: "esports", label: "Esports", keywords: ["gaming"] },
  { value: "field-hockey", label: "Field Hockey", keywords: ["hockey"] },
  { value: "football", label: "Football" },
  { value: "golf", label: "Golf" },
  { value: "gymnastics", label: "Gymnastics" },
  { value: "hockey", label: "Ice Hockey", keywords: ["ice hockey"] },
  { value: "lacrosse", label: "Lacrosse" },
  { value: "pickleball", label: "Pickleball" },
  { value: "rugby", label: "Rugby" },
  { value: "soccer", label: "Soccer" },
  { value: "softball", label: "Softball" },
  { value: "strength-performance", label: "Strength & Performance", keywords: ["strength", "performance", "fitness"] },
  { value: "swimming", label: "Swimming", keywords: ["swim"] },
  { value: "tennis", label: "Tennis" },
  { value: "track-field", label: "Track & Field", keywords: ["track", "field"] },
  { value: "volleyball", label: "Volleyball" },
  { value: "wrestling", label: "Wrestling" }
];

export const THEME_COLOR_OPTIONS: ThemeColorOption[] = [
  {
    value: "#0f766e",
    label: "Deep Teal",
    description: "Clean, calm, and modern."
  },
  {
    value: "#1d4ed8",
    label: "Stadium Blue",
    description: "Confident and classic."
  },
  {
    value: "#166534",
    label: "Field Green",
    description: "Natural and grounded."
  },
  {
    value: "#b91c1c",
    label: "Victory Red",
    description: "Bold and energetic."
  },
  {
    value: "#d97706",
    label: "Signal Gold",
    description: "Warm and high-visibility."
  },
  {
    value: "#0f172a",
    label: "Night Navy",
    description: "Sharp and premium."
  },
  {
    value: "#be185d",
    label: "Rosewood",
    description: "Distinct without feeling loud."
  },
  {
    value: "#7c3aed",
    label: "Royal Violet",
    description: "Expressive and contemporary."
  }
];

export const ORG_SIZE_OPTIONS: OrgSizeOption[] = [
  {
    value: "small",
    label: "Small",
    description: "A lean team or a single program."
  },
  {
    value: "growing",
    label: "Growing",
    description: "Multiple teams, seasons, or locations."
  },
  {
    value: "large",
    label: "Large",
    description: "A broad organization with many stakeholders."
  }
];

const orgTypeValueSet = new Set(ORG_TYPE_OPTIONS.map((option) => option.value));
const activityValueSet = new Set(ACTIVITY_OPTIONS.map((option) => option.value));
const orgSizeValueSet = new Set(ORG_SIZE_OPTIONS.map((option) => option.value));

export function normalizeOrgSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isKnownOrgType(value: string) {
  return orgTypeValueSet.has(value);
}

export function isKnownOrgSize(value: string) {
  return orgSizeValueSet.has(value);
}

export function normalizeActivitySelections(values: string[]) {
  const orderedSelections = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => activityValueSet.has(value));

  return Array.from(new Set(orderedSelections));
}
