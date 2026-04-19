export type OrgRole = string;

export type DefaultOrgRole = "admin" | "member" | "participant";

export type Permission =
  | "org.dashboard.read"
  | "org.manage.read"
  | "org.branding.read"
  | "org.branding.write"
  | "org.pages.read"
  | "org.pages.write"
  | "programs.read"
  | "programs.write"
  | "forms.read"
  | "forms.write"
  | "events.read"
  | "events.write"
  | "calendar.read"
  | "calendar.write"
  | "facilities.read"
  | "facilities.write"
  | "communications.read"
  | "communications.write"
  | "people.read"
  | "people.write";

export type PermissionDefinition = {
  permission: Permission;
  label: string;
  description: string;
  group: "Organization" | "Site Builder" | "Programs" | "Forms" | "Calendar" | "Events" | "Facilities" | "Communications" | "People";
};

export type CustomRolePermissionSource = {
  roleKey: string;
  permissions: Permission[];
};

export const allPermissions: Permission[] = [
  "org.dashboard.read",
  "org.manage.read",
  "org.branding.read",
  "org.branding.write",
  "org.pages.read",
  "org.pages.write",
  "programs.read",
  "programs.write",
  "forms.read",
  "forms.write",
  "events.read",
  "events.write",
  "calendar.read",
  "calendar.write",
  "facilities.read",
  "facilities.write",
  "communications.read",
  "communications.write",
  "people.read",
  "people.write"
];

const permissionSet = new Set(allPermissions);

export const permissionDefinitions: PermissionDefinition[] = [
  {
    permission: "org.dashboard.read",
    label: "Dashboard access",
    description: "View organization dashboards and core navigation.",
    group: "Organization"
  },
  {
    permission: "org.manage.read",
    label: "Management access",
    description: "Open management screens and administer organization settings.",
    group: "Organization"
  },
  {
    permission: "org.branding.read",
    label: "Branding read",
    description: "View branding assets and accent configuration.",
    group: "Organization"
  },
  {
    permission: "org.branding.write",
    label: "Branding write",
    description: "Upload branding assets and save branding updates.",
    group: "Organization"
  },
  {
    permission: "org.pages.read",
    label: "Site builder read",
    description: "Read unpublished pages and editor data.",
    group: "Site Builder"
  },
  {
    permission: "org.pages.write",
    label: "Site builder write",
    description: "Create, edit, publish, and delete site pages and blocks.",
    group: "Site Builder"
  },
  {
    permission: "programs.read",
    label: "Programs read",
    description: "Read draft programs, divisions, schedules, and registration setup.",
    group: "Programs"
  },
  {
    permission: "programs.write",
    label: "Programs write",
    description: "Create and manage programs, divisions, and schedules.",
    group: "Programs"
  },
  {
    permission: "forms.read",
    label: "Forms read",
    description: "Review form configurations and submissions.",
    group: "Forms"
  },
  {
    permission: "forms.write",
    label: "Forms write",
    description: "Create, publish, and operate registration forms.",
    group: "Forms"
  },
  {
    permission: "events.read",
    label: "Events read",
    description: "Review draft and published events.",
    group: "Events"
  },
  {
    permission: "events.write",
    label: "Events write",
    description: "Create, edit, publish, and archive events.",
    group: "Events"
  },
  {
    permission: "calendar.read",
    label: "Calendar read",
    description: "Read calendar entries, schedules, invites, and facility allocations.",
    group: "Calendar"
  },
  {
    permission: "calendar.write",
    label: "Calendar write",
    description: "Create and manage calendar entries, schedules, invites, and facility allocations.",
    group: "Calendar"
  },
  {
    permission: "facilities.read",
    label: "Facilities read",
    description: "Read spaces, bookings, and blackouts in the facilities manager.",
    group: "Facilities"
  },
  {
    permission: "facilities.write",
    label: "Facilities write",
    description: "Create and manage spaces, bookings, approvals, rules, and blackouts.",
    group: "Facilities"
  },
  {
    permission: "communications.read",
    label: "Inbox read",
    description: "View inbox conversations, messages, contacts, and identity suggestions.",
    group: "Communications"
  },
  {
    permission: "communications.write",
    label: "Inbox write",
    description: "Link identities, resolve conversations, and merge communication contacts.",
    group: "Communications"
  },
  {
    permission: "people.read",
    label: "People read",
    description: "View people directory accounts, linked profiles, and relationships.",
    group: "People"
  },
  {
    permission: "people.write",
    label: "People write",
    description: "Create and manage linked profiles, relationship links, invites, and profile status.",
    group: "People"
  }
];

const defaultRolePermissions: Record<DefaultOrgRole, Permission[]> = {
  admin: allPermissions,
  member: [
    "org.dashboard.read",
    "org.branding.read",
    "org.pages.read",
    "programs.read",
    "forms.read",
    "events.read",
    "calendar.read",
    "facilities.read",
    "communications.read",
    "people.read"
  ],
  participant: ["org.dashboard.read", "people.read"]
};

const defaultRoleLabels: Record<DefaultOrgRole, string> = {
  admin: "Admin",
  member: "Member",
  participant: "Participant"
};

export const reservedOrgRoleKeys = new Set<DefaultOrgRole>(["admin", "member", "participant"]);
const adminLikeRoles = new Set(["owner", "admin", "manager"]);

const roleKeyPattern = /^[a-z][a-z0-9-]{1,31}$/;

export function isPermission(value: string): value is Permission {
  return permissionSet.has(value as Permission);
}

export function isDefaultOrgRole(role: string): role is DefaultOrgRole {
  return role === "admin" || role === "member" || role === "participant";
}

export function isReservedOrgRoleKey(roleKey: string) {
  return reservedOrgRoleKeys.has(roleKey as DefaultOrgRole);
}

export function isValidRoleKey(roleKey: string) {
  return roleKeyPattern.test(roleKey);
}

export function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getDefaultRolePermissions(role: string): Permission[] | null {
  const normalizedRole = role === "user" ? "member" : role;
  if (!isDefaultOrgRole(normalizedRole)) {
    return null;
  }

  return defaultRolePermissions[normalizedRole];
}

export function getDefaultRoleLabel(role: DefaultOrgRole) {
  return defaultRoleLabels[role];
}

export function getRoleLabel(roleKey: string) {
  if (isAdminLikeRole(roleKey)) {
    return "Admin";
  }

  if (roleKey === "member" || roleKey === "user") {
    return "Member";
  }

  if (roleKey === "participant") {
    return "Participant";
  }

  if (isDefaultOrgRole(roleKey)) {
    return getDefaultRoleLabel(roleKey);
  }

  return roleKey
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isAdminLikeRole(role: string) {
  return adminLikeRoles.has(role);
}

export function getPermissionsForRole(roleKey: OrgRole, customRoles: CustomRolePermissionSource[] = []) {
  const defaultPermissions = getDefaultRolePermissions(roleKey);
  if (defaultPermissions) {
    return defaultPermissions;
  }

  const customRole = customRoles.find((role) => role.roleKey === roleKey);
  return customRole?.permissions ?? [];
}

export function hasPermissions(grantedPermissions: Permission[], requiredPermissions: Permission[]) {
  const granted = new Set(grantedPermissions);
  return requiredPermissions.every((permission) => granted.has(permission));
}
