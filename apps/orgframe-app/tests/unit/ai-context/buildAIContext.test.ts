import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

type TestOrg = { id: string; slug: string; name: string };
type TestMembership = { role: string };
type ErrorLike = { message: string };

const state = {
  sessionUser: { id: "user-1", email: "user1@example.com" } as { id: string; email: string | null } | null,
  players: [] as Array<{ id: string; label: string; subtitle: string | null }>,
  orgsBySlug: new Map<string, TestOrg>(),
  membershipsByKey: new Map<string, TestMembership>(),
  permissionsByRole: new Map<string, string[]>(),
  orgQueryError: null as ErrorLike | null,
  membershipQueryError: null as ErrorLike | null,
  reset() {
    this.sessionUser = { id: "user-1", email: "user1@example.com" };
    this.orgsBySlug.clear();
    this.membershipsByKey.clear();
    this.permissionsByRole.clear();
    this.players = [];
    this.orgQueryError = null;
    this.membershipQueryError = null;
  }
};

function keyForMembership(orgId: string, userId: string) {
  return `${orgId}:${userId}`;
}

function keyForRolePermissions(orgId: string, role: string) {
  return `${orgId}:${role}`;
}

function createSupabaseMock() {
  return {
    from(table: string) {
      return {
        select() {
          const filters: Record<string, string> = {};

          return {
            eq(field: string, value: string) {
              filters[field] = value;
              return this;
            },
            async maybeSingle() {
              if (table === "orgs") {
                if (state.orgQueryError) {
                  return {
                    data: null,
                    error: state.orgQueryError
                  };
                }

                return {
                  data: state.orgsBySlug.get(filters.slug) ?? null,
                  error: null
                };
              }

              if (table === "memberships") {
                if (state.membershipQueryError) {
                  return {
                    data: null,
                    error: state.membershipQueryError
                  };
                }

                return {
                  data: state.membershipsByKey.get(keyForMembership(filters.org_id, filters.user_id)) ?? null,
                  error: null
                };
              }

              throw new Error(`Unexpected table: ${table}`);
            }
          };
        }
      };
    }
  };
}

mock.module("@/src/features/core/auth/server/getSessionUser", {
  namedExports: {
    getSessionUser: async () => state.sessionUser
  }
});

mock.module("@/src/shared/data-api/server", {
  namedExports: {
    createSupabaseServer: async () => createSupabaseMock()
  }
});

mock.module("@/src/shared/org/customRoles", {
  namedExports: {
    resolveOrgRolePermissions: async (_supabase: unknown, orgId: string, role: string) =>
      state.permissionsByRole.get(keyForRolePermissions(orgId, role)) ?? []
  }
});

mock.module("@/src/features/players/db/queries", {
  namedExports: {
    listPlayersForPicker: async () => state.players
  }
});

let buildAIContext!: typeof import("@/src/features/ai/context/buildAIContext").buildAIContext;
let withAIContext!: typeof import("@/src/features/ai/context/withAIContext").withAIContext;

before(async () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://orgframe.app";
  ({ buildAIContext } = await import("@/src/features/ai/context/buildAIContext"));
  ({ withAIContext } = await import("@/src/features/ai/context/withAIContext"));
});

beforeEach(() => {
  state.reset();
});

describe("buildAIContext", () => {
  it("resolves valid user + org via subdomain", async () => {
    state.orgsBySlug.set("acme", { id: "org-1", slug: "acme", name: "Acme SC" });
    state.membershipsByKey.set(keyForMembership("org-1", "user-1"), { role: "admin" });
    state.permissionsByRole.set(keyForRolePermissions("org-1", "admin"), ["calendar.write", "facilities.write", "communications.write"]);

    const req = new Request("https://acme.orgframe.app/calendar", {
      headers: {
        "x-request-id": "req-1",
        "user-agent": "ai-context-test"
      }
    });

    const ctx = await buildAIContext(req);

    assert.equal(ctx.requestId, "req-1");
    assert.equal(ctx.org?.slug, "acme");
    assert.equal(ctx.debug.resolvedFrom.org, "subdomain");
    assert.equal(ctx.scope.currentModule, "calendar");
    assert.equal(ctx.capabilities.canCreateEvents, true);
    assert.equal(ctx.capabilities.canEditEvents, true);
    assert.equal(ctx.capabilities.canDeleteEvents, true);
    assert.equal(ctx.capabilities.canManageFacilities, true);
    assert.equal(ctx.capabilities.canSendCommunications, true);
    assert.equal(ctx.account.players.length, 0);
  });

  it("resolves valid user + org via path fallback", async () => {
    state.orgsBySlug.set("acme", { id: "org-1", slug: "acme", name: "Acme SC" });
    state.membershipsByKey.set(keyForMembership("org-1", "user-1"), { role: "member" });
    state.permissionsByRole.set(keyForRolePermissions("org-1", "member"), ["calendar:create"]);

    const ctx = await buildAIContext(new Request("https://orgframe.app/acme/programs/program-123"));

    assert.equal(ctx.org?.slug, "acme");
    assert.equal(ctx.debug.resolvedFrom.org, "path");
    assert.equal(ctx.scope.currentModule, "programs");
    assert.equal(ctx.scope.entityId, "program-123");
    assert.equal(ctx.capabilities.canCreateEvents, true);
    assert.equal(ctx.capabilities.canEditEvents, false);
  });

  it("throws explicit error when org is missing", async () => {
    await assert.rejects(() => buildAIContext(new Request("https://missing.orgframe.app/calendar")), (error: unknown) => {
      return error instanceof Error && (error as { code?: string }).code === "ORG_NOT_FOUND";
    });
  });

  it("throws explicit error when membership is missing", async () => {
    state.orgsBySlug.set("acme", { id: "org-1", slug: "acme", name: "Acme SC" });

    await assert.rejects(() => buildAIContext(new Request("https://acme.orgframe.app/calendar")), (error: unknown) => {
      return error instanceof Error && (error as { code?: string }).code === "MEMBERSHIP_NOT_FOUND";
    });
  });

  it("resolves account context without org on account routes", async () => {
    state.players = [{ id: "player-1", label: "Alex Doe", subtitle: "DOB: 2012-04-03" }];
    const ctx = await buildAIContext(new Request("https://orgframe.app/account/players?playerId=player-1"));

    assert.equal(ctx.org, null);
    assert.equal(ctx.membership, null);
    assert.equal(ctx.debug.resolvedFrom.org, "none");
    assert.equal(ctx.scope.currentModule, "players");
    assert.equal(ctx.account.activePlayerId, "player-1");
    assert.deepEqual(ctx.account.players, state.players);
  });
});

describe("withAIContext", () => {
  it("passes built context to the handler", async () => {
    state.orgsBySlug.set("acme", { id: "org-1", slug: "acme", name: "Acme SC" });
    state.membershipsByKey.set(keyForMembership("org-1", "user-1"), { role: "admin" });
    state.permissionsByRole.set(keyForRolePermissions("org-1", "admin"), ["calendar.write"]);

    const result = await withAIContext(new Request("https://acme.orgframe.app/calendar"), async (ctx) => {
      return `${ctx.user.id}:${ctx.org?.slug ?? "none"}:${ctx.scope.currentModule}`;
    });

    assert.equal(result, "user-1:acme:calendar");
  });

  it("rethrows typed errors for missing user, org, and membership", async () => {
    state.sessionUser = null;
    await assert.rejects(() => withAIContext(new Request("https://acme.orgframe.app/calendar"), async () => "ok"), (error: unknown) => {
      return error instanceof Error && (error as { code?: string }).code === "UNAUTHENTICATED";
    });

    state.reset();
    await assert.rejects(() => withAIContext(new Request("https://acme.orgframe.app/calendar"), async () => "ok"), (error: unknown) => {
      return error instanceof Error && (error as { code?: string }).code === "ORG_NOT_FOUND";
    });

    state.reset();
    state.orgsBySlug.set("acme", { id: "org-1", slug: "acme", name: "Acme SC" });
    await assert.rejects(() => withAIContext(new Request("https://acme.orgframe.app/calendar"), async () => "ok"), (error: unknown) => {
      return error instanceof Error && (error as { code?: string }).code === "MEMBERSHIP_NOT_FOUND";
    });
  });

  it("normalizes unknown internal errors", async () => {
    state.orgsBySlug.set("acme", { id: "org-1", slug: "acme", name: "Acme SC" });
    state.membershipsByKey.set(keyForMembership("org-1", "user-1"), { role: "admin" });
    state.permissionsByRole.set(keyForRolePermissions("org-1", "admin"), ["calendar.write"]);

    await assert.rejects(
      () =>
        withAIContext(new Request("https://acme.orgframe.app/calendar"), async () => {
          throw new Error("boom");
        }),
      (error: unknown) => {
        return error instanceof Error && (error as { code?: string }).code === "INTERNAL";
      }
    );
  });
});
