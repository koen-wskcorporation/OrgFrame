/**
 * Centralized tool enablement configuration for OrgFrame.
 *
 * This is the single source of truth for:
 * - Tool keys and metadata
 * - Default enablement state
 * - Permission requirements per tool
 * - Navigation visibility rules
 */

import type { Permission } from "@/src/features/core/access";

// ============================================================================
// Tool Keys
// ============================================================================

export const orgToolKeys = [
  "info",
  "domains",
  "branding",
  "people",
  "billing",
  "website",
  "programs",
  "calendar",
  "facilities",
  "forms",
  "inbox",
  "imports",
  "data",
] as const;

export type OrgToolKey = (typeof orgToolKeys)[number];

// ============================================================================
// Tool Metadata
// ============================================================================

export type OrgToolMetadata = {
  key: OrgToolKey;
  label: string;
  description: string;
  icon: string;
  enabledByDefault: boolean;
};

export const ORG_TOOLS: Record<OrgToolKey, OrgToolMetadata> = {
  info: {
    key: "info",
    label: "General",
    description: "View organization metadata and governing body settings.",
    icon: "building",
    enabledByDefault: true,
  },
  domains: {
    key: "domains",
    label: "Domains",
    description: "Connect and manage your custom organization domain.",
    icon: "globe",
    enabledByDefault: true,
  },
  branding: {
    key: "branding",
    label: "Branding",
    description: "Update logo, icon, and organization accent color.",
    icon: "palette",
    enabledByDefault: true,
  },
  people: {
    key: "people",
    label: "People",
    description: "Manage accounts and the people they manage.",
    icon: "users",
    enabledByDefault: true,
  },
  billing: {
    key: "billing",
    label: "Billing",
    description: "Manage Stripe Connect onboarding and tax compliance defaults.",
    icon: "credit-card",
    enabledByDefault: true,
  },
  website: {
    key: "website",
    label: "Website",
    description: "Manage pages, navigation, and public site structure.",
    icon: "layout",
    enabledByDefault: true,
  },
  programs: {
    key: "programs",
    label: "Programs",
    description: "Create and edit programs, divisions, and schedules.",
    icon: "layout",
    enabledByDefault: true,
  },
  calendar: {
    key: "calendar",
    label: "Calendar",
    description: "Manage events, practices, games, facility bookings, and team invites.",
    icon: "calendar",
    enabledByDefault: true,
  },
  facilities: {
    key: "facilities",
    label: "Facilities",
    description: "Manage spaces, bookings, blackouts, and facility availability.",
    icon: "map",
    enabledByDefault: true,
  },
  forms: {
    key: "forms",
    label: "Forms",
    description: "Build forms and process submissions.",
    icon: "file-text",
    enabledByDefault: true,
  },
  inbox: {
    key: "inbox",
    label: "Inbox",
    description: "Resolve and manage unified conversations across channels.",
    icon: "inbox",
    enabledByDefault: true,
  },
  imports: {
    key: "imports",
    label: "Smart Import",
    description: "Run staged imports for people, programs, and commerce data.",
    icon: "file-text",
    enabledByDefault: true,
  },
  "data": {
    key: "data",
    label: "Data",
    description: "Unified dashboards and tables pulling from every tool.",
    icon: "bar-chart",
    enabledByDefault: true,
  },
};

// ============================================================================
// Tool Availability
// ============================================================================

export type OrgToolAvailability = Record<OrgToolKey, boolean>;

export const DEFAULT_TOOL_AVAILABILITY: OrgToolAvailability = {
  info: true,
  domains: true,
  branding: true,
  people: true,
  billing: true,
  website: true,
  programs: true,
  calendar: true,
  facilities: true,
  forms: true,
  inbox: true,
  imports: true,
  "data": true,
};

export function isOrgToolEnabled(toolAvailability: OrgToolAvailability, tool: OrgToolKey): boolean {
  return toolAvailability[tool] !== false;
}

// ============================================================================
// Permission Mappings
// ============================================================================

/**
 * Maps each tool to the permissions required to access it.
 * If a tool is disabled, these permissions should be filtered out.
 */
export const TOOL_PERMISSION_MAP: Record<OrgToolKey, Permission[]> = {
  branding: ["org.branding.read", "org.branding.write"],
  people: ["people.read", "people.write"],
  website: ["org.pages.read", "org.pages.write"],
  programs: ["programs.read", "programs.write"],
  forms: ["forms.read", "forms.write"],
  calendar: ["calendar.read", "calendar.write", "events.read", "events.write"],
  facilities: ["facilities.read", "facilities.write"],
  inbox: ["communications.read", "communications.write"],
  "data": ["data.read", "data.write"],
  // These tools don't have specific permission mappings - access is controlled by tool availability alone
  info: [],
  domains: [],
  billing: [],
  imports: [],
};

export function filterPermissionsByOrgTools(
  permissions: Permission[],
  toolAvailability: OrgToolAvailability
): Permission[] {
  const blockedPermissions = new Set<Permission>();

  for (const [tool, mappedPermissions] of Object.entries(TOOL_PERMISSION_MAP) as Array<
    [OrgToolKey, Permission[]]
  >) {
    if (!isOrgToolEnabled(toolAvailability, tool)) {
      for (const permission of mappedPermissions) {
        blockedPermissions.add(permission);
      }
    }
  }

  return permissions.filter((permission) => !blockedPermissions.has(permission));
}

// ============================================================================
// Navigation Visibility
// ============================================================================

export type OrgCapabilities = {
  manage?: { canRead?: boolean; canWrite?: boolean };
  people?: { canAccess?: boolean };
  programs?: { canAccess?: boolean };
  calendar?: { canAccess?: boolean };
  facilities?: { canAccess?: boolean };
  forms?: { canAccess?: boolean };
  communications?: { canAccess?: boolean };
  dataCenter?: { canAccess?: boolean; canWrite?: boolean };
};

export function isToolVisible(
  tool: OrgToolKey,
  capabilities: OrgCapabilities | null,
  toolAvailability: OrgToolAvailability
): boolean {
  if (!isOrgToolEnabled(toolAvailability, tool)) {
    return false;
  }

  switch (tool) {
    case "info":
      return Boolean(capabilities?.manage?.canRead);
    case "domains":
      return Boolean(capabilities?.manage?.canRead);
    case "branding":
      return Boolean(capabilities?.manage?.canRead);
    case "people":
      return Boolean(capabilities?.people?.canAccess || capabilities?.manage?.canRead);
    case "billing":
      return Boolean(capabilities?.manage?.canRead);
    case "website":
      return true;
    case "programs":
      return Boolean(capabilities?.programs?.canAccess);
    case "calendar":
      return Boolean(capabilities?.calendar?.canAccess || capabilities?.programs?.canAccess);
    case "facilities":
      return Boolean(capabilities?.facilities?.canAccess);
    case "forms":
      return Boolean(capabilities?.forms?.canAccess);
    case "inbox":
      return Boolean(capabilities?.communications?.canAccess);
    case "imports":
      return Boolean(capabilities?.manage?.canRead);
    case "data":
      return Boolean(capabilities?.dataCenter?.canAccess);
    default:
      return true;
  }
}

// ============================================================================
// Tool Key Normalization
// ============================================================================

export function normalizeToolKey(value: string): OrgToolKey | null {
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
    case "people":
    case "accounts":
    case "user-accounts":
      return "people";
    case "billing":
    case "payment":
    case "payments":
      return "billing";
    case "website":
    case "site":
    case "pages":
    case "page-builder":
    case "site-builder":
      return "website";
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
    case "data":
    case "datacenter":
    case "data":
      return "data";
    default:
      return null;
  }
}

// ============================================================================
// Features JSON Resolution
// ============================================================================

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

export function resolveOrgToolAvailability(featuresJson: unknown): OrgToolAvailability {
  const root = asRecord(featuresJson);
  if (!root) {
    return { ...DEFAULT_TOOL_AVAILABILITY };
  }

  const tools = asRecord(root.tools) ?? root;
  const resolved: OrgToolAvailability = { ...DEFAULT_TOOL_AVAILABILITY };
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

  // Legacy: sportsconnect alias for imports
  if (typeof tools.sportsconnect === "boolean" && typeof tools.imports !== "boolean") {
    resolved.imports = tools.sportsconnect as boolean;
  }

  return resolved;
}
