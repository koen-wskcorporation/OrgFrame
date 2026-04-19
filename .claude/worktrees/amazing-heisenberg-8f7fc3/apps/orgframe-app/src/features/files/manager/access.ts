import { can } from "@/src/shared/permissions/can";
import type { Permission } from "@/src/features/core/access";
import type { FileManagerAccessTag } from "@/src/features/files/manager/types";

const readPermissionsByTag: Record<FileManagerAccessTag, Permission[]> = {
  manage: ["org.manage.read", "org.branding.read", "org.branding.write", "org.pages.read", "org.pages.write", "programs.read", "programs.write"],
  branding: ["org.branding.read", "org.branding.write", "org.manage.read"],
  programs: ["programs.read", "programs.write", "org.manage.read"],
  pages: ["org.pages.read", "org.pages.write", "org.manage.read"],
  personal: []
};

const writePermissionsByTag: Record<FileManagerAccessTag, Permission[]> = {
  manage: ["org.manage.read"],
  branding: ["org.branding.write", "org.manage.read"],
  programs: ["programs.write", "org.manage.read"],
  pages: ["org.pages.write", "org.manage.read"],
  personal: []
};

function hasAnyPermission(grantedPermissions: Permission[], required: Permission[]) {
  return required.some((permission) => can(grantedPermissions, permission));
}

export function canReadAccessTag(grantedPermissions: Permission[], accessTag: FileManagerAccessTag) {
  const required = readPermissionsByTag[accessTag];
  if (required.length === 0) {
    return false;
  }

  return hasAnyPermission(grantedPermissions, required);
}

export function canWriteAccessTag(grantedPermissions: Permission[], accessTag: FileManagerAccessTag) {
  const required = writePermissionsByTag[accessTag];
  if (required.length === 0) {
    return false;
  }

  return hasAnyPermission(grantedPermissions, required);
}

export function canReadAnyOrgFiles(grantedPermissions: Permission[]) {
  return canReadAccessTag(grantedPermissions, "manage");
}

export function canWriteAnyOrgFiles(grantedPermissions: Permission[]) {
  return canWriteAccessTag(grantedPermissions, "manage")
    || canWriteAccessTag(grantedPermissions, "branding")
    || canWriteAccessTag(grantedPermissions, "programs")
    || canWriteAccessTag(grantedPermissions, "pages");
}
