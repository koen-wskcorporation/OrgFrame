import type { FacilitySpace, FacilitySpaceStatus } from "@/src/features/facilities/types";

export type FacilitySpaceStatusLabels = Partial<Record<FacilitySpaceStatus, string>>;

function sanitizeLabel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 48);
}

function titleFromStatus(status: string) {
  return status.replace(/_/g, " ");
}

export function parseFacilitySpaceStatusLabels(input: Record<string, unknown> | null | undefined): FacilitySpaceStatusLabels {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const open = sanitizeLabel(input.open);
  const closed = sanitizeLabel(input.closed);
  const archived = sanitizeLabel(input.archived);

  return {
    ...(open ? { open } : {}),
    ...(closed ? { closed } : {}),
    ...(archived ? { archived } : {})
  };
}

export function normalizeFacilitySpaceStatusLabels(input: FacilitySpaceStatusLabels | null | undefined): FacilitySpaceStatusLabels {
  if (!input) {
    return {};
  }

  const open = sanitizeLabel(input.open);
  const closed = sanitizeLabel(input.closed);
  const archived = sanitizeLabel(input.archived);

  return {
    ...(open ? { open } : {}),
    ...(closed ? { closed } : {}),
    ...(archived ? { archived } : {})
  };
}

export function formatFacilitySpaceStatusLabel(status: FacilitySpaceStatus, labels: FacilitySpaceStatusLabels | null | undefined) {
  const customLabel = labels?.[status];
  return customLabel ?? titleFromStatus(status);
}

export function buildFacilitySpaceStatusOptions(labels: FacilitySpaceStatusLabels | null | undefined) {
  const normalized = normalizeFacilitySpaceStatusLabels(labels);
  const values: FacilitySpaceStatus[] = ["open", "closed", "archived"];

  return values.map((value) => ({
    value,
    label: formatFacilitySpaceStatusLabel(value, normalized)
  }));
}

export function resolveFacilitySpaceStatusLabels(space: FacilitySpace) {
  const labelsFromColumn = parseFacilitySpaceStatusLabels(space.statusLabelsJson);
  if (Object.keys(labelsFromColumn).length > 0) {
    return labelsFromColumn;
  }

  const metadataLabels = space.metadataJson.status_labels;
  if (!metadataLabels || typeof metadataLabels !== "object" || Array.isArray(metadataLabels)) {
    return {};
  }

  return parseFacilitySpaceStatusLabels(metadataLabels as Record<string, unknown>);
}
