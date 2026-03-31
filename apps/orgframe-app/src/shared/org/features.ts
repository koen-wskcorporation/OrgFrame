import type { Permission } from "@/src/features/core/access";

export const orgToolKeys = [
  "info",
  "domains",
  "branding",
  "access",
  "billing",
  "site",
  "programs",
  "calendar",
  "facilities",
  "forms",
  "inbox",
  "imports"
] as const;

export type OrgToolKey = (typeof orgToolKeys)[number];

export type OrgToolAvailability = Record<OrgToolKey, boolean>;

const defaultOrgToolAvailability: OrgToolAvailability = {
  info: true,
  domains: true,
  branding: true,
  access: true,
  billing: true,
  site: true,
  programs: true,
  calendar: true,
  facilities: true,
  forms: true,
  inbox: true,
  imports: true
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeToolKey(value: string): OrgToolKey | null {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");

  switch (normalized) {
    case "info":
    case "general":
    case "org-info":
      return "info";
    case "domains":
    case "domain":
      return "domains";
    case "branding":
    case "brand":
      return "branding";
    case "access":
    case "accounts":
    case "user-accounts":
      return "access";
    case "billing":
      return "billing";
    case "site":
    case "pages":
    case "page-builder":
      return "site";
    case "program":
    case "programs":
      return "programs";
    case "calendar":
    case "events":
      return "calendar";
    case "facilities":
    case "facility":
      return "facilities";
    case "forms":
    case "form":
      return "forms";
    case "inbox":
    case "communications":
      return "inbox";
    case "sportsconnect":
    case "sports-connect":
    case "import":
    case "imports":
    case "smart-import":
      return "imports";
    default:
      return null;
  }
}

export function resolveOrgToolAvailability(featuresJson: unknown): OrgToolAvailability {
  const root = asRecord(featuresJson);
  if (!root) {
    return { ...defaultOrgToolAvailability };
  }

  const tools = asRecord(root.tools) ?? root;
  const resolved: OrgToolAvailability = { ...defaultOrgToolAvailability };
  const enabledList = asStringArray(tools.available ?? tools.available_tools ?? root.available_tools);
  const disabledList = asStringArray(tools.disabled ?? tools.disabled_tools ?? root.disabled_tools);

  if (enabledList.length > 0) {
    for (const key of orgToolKeys) {
      resolved[key] = false;
    }

    for (const rawKey of enabledList) {
      const normalizedKey = normalizeToolKey(rawKey);
      if (normalizedKey) {
        resolved[normalizedKey] = true;
      }
    }
  }

  for (const rawKey of disabledList) {
    const normalizedKey = normalizeToolKey(rawKey);
    if (normalizedKey) {
      resolved[normalizedKey] = false;
    }
  }

  for (const key of orgToolKeys) {
    if (typeof tools[key] === "boolean") {
      resolved[key] = tools[key] as boolean;
    }
  }

  if (typeof tools.sportsconnect === "boolean" && typeof tools.imports !== "boolean") {
    resolved.imports = tools.sportsconnect as boolean;
  }

  return resolved;
}

export function isOrgToolEnabled(toolAvailability: OrgToolAvailability, tool: OrgToolKey) {
  return toolAvailability[tool] !== false;
}

const permissionToolMap: Array<[OrgToolKey, Permission[]]> = [
  ["branding", ["org.branding.read", "org.branding.write"]],
  ["site", ["org.pages.read", "org.pages.write"]],
  ["programs", ["programs.read", "programs.write"]],
  ["forms", ["forms.read", "forms.write"]],
  ["calendar", ["calendar.read", "calendar.write", "events.read", "events.write"]],
  ["facilities", ["facilities.read", "facilities.write"]],
  ["inbox", ["communications.read", "communications.write"]]
];

export function filterPermissionsByOrgTools(permissions: Permission[], toolAvailability: OrgToolAvailability): Permission[] {
  const blockedPermissions = new Set<Permission>();

  for (const [tool, mappedPermissions] of permissionToolMap) {
    if (!isOrgToolEnabled(toolAvailability, tool)) {
      for (const permission of mappedPermissions) {
        blockedPermissions.add(permission);
      }
    }
  }

  return permissions.filter((permission) => !blockedPermissions.has(permission));
}
