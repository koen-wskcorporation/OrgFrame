import { allPermissions } from "@/src/features/core/access";
import { InvalidPermissionsError } from "@/src/features/ai/context/errors";
import type { AIContext } from "@/src/features/ai/context/types";

const aliasPermissions = new Set([
  "calendar:create",
  "calendar:edit",
  "calendar:delete",
  "facilities:manage",
  "communications:send"
]);

const validPermissions = new Set<string>([...allPermissions, ...aliasPermissions]);

function validatePermissions(permissions: string[]) {
  const invalid = permissions.filter((permission) => !validPermissions.has(permission));

  if (invalid.length > 0) {
    throw new InvalidPermissionsError(`Invalid permissions detected: ${invalid.join(", ")}`);
  }
}

export function deriveCapabilities(permissions: string[]): AIContext["capabilities"] {
  validatePermissions(permissions);

  const granted = new Set(permissions);

  return {
    canCreateEvents: granted.has("calendar:create") || granted.has("calendar.write"),
    canEditEvents: granted.has("calendar:edit") || granted.has("calendar.write"),
    canDeleteEvents: granted.has("calendar:delete") || granted.has("calendar.write"),
    canManageFacilities: granted.has("facilities:manage") || granted.has("facilities.write"),
    canSendCommunications: granted.has("communications:send") || granted.has("communications.write")
  };
}
