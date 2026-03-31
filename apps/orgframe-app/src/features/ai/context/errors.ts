export type AIContextErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_USER"
  | "ORG_SLUG_NOT_RESOLVED"
  | "ORG_NOT_FOUND"
  | "MEMBERSHIP_NOT_FOUND"
  | "INVALID_PERMISSIONS"
  | "SCOPE_RESOLUTION_FAILED"
  | "INTERNAL";

export class AIContextError extends Error {
  public readonly code: AIContextErrorCode;
  public readonly status: number;

  constructor(code: AIContextErrorCode, message: string, status: number) {
    super(message);
    this.name = "AIContextError";
    this.code = code;
    this.status = status;
  }
}

export class UnauthenticatedError extends AIContextError {
  constructor(message = "Missing authenticated user.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class InvalidUserError extends AIContextError {
  constructor(message = "Authenticated user is missing required fields.") {
    super("INVALID_USER", message, 400);
  }
}

export class OrgSlugNotResolvedError extends AIContextError {
  constructor(message = "Unable to resolve organization slug from request.") {
    super("ORG_SLUG_NOT_RESOLVED", message, 400);
  }
}

export class OrgNotFoundError extends AIContextError {
  constructor(message = "Organization not found.") {
    super("ORG_NOT_FOUND", message, 404);
  }
}

export class MembershipNotFoundError extends AIContextError {
  constructor(message = "User does not have membership in this organization.") {
    super("MEMBERSHIP_NOT_FOUND", message, 403);
  }
}

export class InvalidPermissionsError extends AIContextError {
  constructor(message = "Invalid permissions detected for organization membership.") {
    super("INVALID_PERMISSIONS", message, 400);
  }
}

export class ScopeResolutionError extends AIContextError {
  constructor(message = "Unable to resolve request scope from pathname.") {
    super("SCOPE_RESOLUTION_FAILED", message, 400);
  }
}

export function normalizeAIContextError(error: unknown): AIContextError {
  if (error instanceof AIContextError) {
    return error;
  }

  if (error instanceof Error) {
    return new AIContextError("INTERNAL", error.message || "Unexpected AI context failure.", 500);
  }

  return new AIContextError("INTERNAL", "Unexpected AI context failure.", 500);
}
