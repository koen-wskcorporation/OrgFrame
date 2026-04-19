export type ShareTargetType = "team" | "division" | "program" | "person" | "admin" | "group";

export type SharePermission = "view" | "comment" | "edit";

export type ShareTarget = {
  id: string;
  type: ShareTargetType;
  label: string;
  subtitle?: string;
};

export type ShareSelectionPayload = {
  targets: ShareTarget[];
  permission: SharePermission;
};

export type DynamicOrgGroupKey = "org-admins" | "org-members" | "all-coaches" | "all-managers" | "all-staff";

export type DynamicOrgGroup = {
  key: DynamicOrgGroupKey;
  type: "admin" | "group";
  label: string;
  description: string;
  memberUserIds: string[];
};

export type DynamicOrgGroupPreview = {
  userId: string;
  email: string | null;
  displayName: string;
};

export type DynamicOrgGroupWorkspaceItem = {
  key: DynamicOrgGroupKey;
  type: "admin" | "group";
  label: string;
  description: string;
  memberCount: number;
  previewMembers: DynamicOrgGroupPreview[];
};

export type OrgShareCatalog = {
  options: ShareTarget[];
};
