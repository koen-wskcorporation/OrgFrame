import { can } from "@/src/shared/permissions/can";
import type { Permission } from "@/src/features/core/access";

export type OrgCapabilities = {
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
  facilities: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  communications: {
    canRead: boolean;
    canWrite: boolean;
    canAccess: boolean;
  };
  people: {
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
  const facilities = resolveReadWriteAccess(permissions, "facilities.read", "facilities.write");
  const communications = resolveReadWriteAccess(permissions, "communications.read", "communications.write");
  const people = resolveReadWriteAccess(permissions, "people.read", "people.write");
  const canManage = can(permissions, "org.manage.read");

  return {
    manage: {
      canRead: canManage,
      canAccessArea:
        canManage ||
        pages.canAccess ||
        programs.canAccess ||
        forms.canAccess ||
        calendar.canAccess ||
        events.canAccess ||
        facilities.canAccess ||
        communications.canAccess ||
        people.canAccess
    },
    pages,
    programs,
    forms,
    calendar,
    events,
    facilities,
    communications,
    people
  };
}
