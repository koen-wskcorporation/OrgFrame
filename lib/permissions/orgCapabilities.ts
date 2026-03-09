import { can } from "@/lib/permissions/can";
import type { Permission } from "@/modules/core/access";

export type OrgCapabilities = {
  workspace: {
    canRead: boolean;
    canAccessArea: boolean;
  };
  settings: {
    canRead: boolean;
    canAccess: boolean;
  };
  // Backward-compat alias while callsites migrate.
  manage: {
    canRead: boolean;
    canAccessArea: boolean;
  };
  pages: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  programs: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  forms: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  calendar: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  events: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  spaces: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  // Backward-compat alias while callsites migrate.
  facilities: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
};

function resolveReadWriteAccess(permissions: Permission[], readPermission: Permission, writePermission: Permission) {
  const canWrite = can(permissions, writePermission);
  const canRead = canWrite || can(permissions, readPermission);

  return {
    canRead,
    canWrite,
    canAccess: canRead
  };
}

export function getOrgCapabilities(permissions: Permission[]): OrgCapabilities {
  const pages = resolveReadWriteAccess(permissions, "org.pages.read", "org.pages.write");
  const programs = resolveReadWriteAccess(permissions, "programs.read", "programs.write");
  const forms = resolveReadWriteAccess(permissions, "forms.read", "forms.write");
  const calendar = resolveReadWriteAccess(permissions, "calendar.read", "calendar.write");
  const events = resolveReadWriteAccess(permissions, "events.read", "events.write");
  const spaces = resolveReadWriteAccess(permissions, "spaces.read", "spaces.write");
  const canManage = can(permissions, "org.manage.read");
  const canAccessArea = canManage || pages.canAccess || programs.canAccess || forms.canAccess || calendar.canAccess || events.canAccess || spaces.canAccess;
  const settings = {
    canRead: canManage,
    canAccess: canManage
  };

  return {
    workspace: {
      canRead: canAccessArea,
      canAccessArea
    },
    settings,
    manage: {
      canRead: canManage,
      canAccessArea
    },
    pages,
    programs,
    forms,
    calendar,
    events,
    spaces,
    // Backward-compat alias while callsites migrate.
    facilities: spaces
  };
}
