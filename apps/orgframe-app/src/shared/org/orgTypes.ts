export const ORG_TYPES = [
  "club",
  "school_district",
  "travel_league",
  "rec_league",
  "tournament_organizer",
  "camp",
  "other"
] as const;

export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  club: "Club",
  school_district: "School district",
  travel_league: "Travel",
  rec_league: "Recreational",
  tournament_organizer: "Tournament organizer",
  camp: "Camp",
  other: "Other"
};

export function isOrgType(value: unknown): value is OrgType {
  return typeof value === "string" && (ORG_TYPES as readonly string[]).includes(value);
}

export function normalizeOrgType(value: unknown): OrgType | null {
  return isOrgType(value) ? value : null;
}

export const ORG_TYPE_OPTIONS = ORG_TYPES.map((value) => ({
  value,
  label: ORG_TYPE_LABELS[value]
}));
