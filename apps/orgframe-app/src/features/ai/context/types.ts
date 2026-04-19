export type AIContext = {
  requestId: string;
  user: {
    id: string;
    email: string;
    name?: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    phone: string | null;
    avatarPath: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
    lastSignInAt: string | null;
    metadata: Record<string, unknown>;
  };
  org: {
    id: string;
    slug: string;
    name: string;
  } | null;
  membership: {
    role: string;
    permissions: string[];
  } | null;
  account: {
    activePlayerId: string | null;
    players: Array<{
      id: string;
      label: string;
      subtitle: string | null;
    }>;
  };
  scope: {
    currentModule?: "calendar" | "facilities" | "programs" | "teams" | "communications" | "files" | "settings" | "profiles" | "workspace" | "unknown";
    entityId?: string;
    entityType?: string;
  };
  environment: {
    host: string;
    pathname: string;
    userAgent?: string;
  };
  capabilities: {
    canCreateEvents: boolean;
    canEditEvents: boolean;
    canDeleteEvents: boolean;
    canManageFacilities: boolean;
    canSendCommunications: boolean;
  };
  debug: {
    resolvedFrom: {
      org: "subdomain" | "path" | "fallback" | "none";
      user: "session" | "token";
    };
  };
};
