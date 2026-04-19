export type HeaderAccountState =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      user: {
        userId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
      };
      organizations: {
        orgId: string;
        orgName: string;
        orgSlug: string;
        iconUrl: string | null;
      }[];
      profiles: {
        id: string;
        displayName: string;
        relationshipType: "self" | "guardian" | "delegated_manager";
      }[];
    };
