import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSportsEngineOauthDialogUrl,
  createSignedSportsEngineOauthState,
  fetchSportsEngineDataset,
  verifySignedSportsEngineOauthState
} from "@/src/features/imports/integrations/sportsengine";

describe("sportsengine oauth state", () => {
  it("signs and verifies oauth state", () => {
    const state = createSignedSportsEngineOauthState(
      {
        orgSlug: "acme",
        userId: "user-123",
        origin: "https://orgframe.test"
      },
      "state-secret"
    );

    const parsed = verifySignedSportsEngineOauthState(state, "state-secret", 600);
    assert.equal(parsed.orgSlug, "acme");
    assert.equal(parsed.userId, "user-123");
    assert.equal(parsed.origin, "https://orgframe.test");
  });

  it("rejects tampered state", () => {
    const state = createSignedSportsEngineOauthState(
      {
        orgSlug: "acme",
        userId: "user-123",
        origin: "https://orgframe.test"
      },
      "state-secret"
    );
    const [payload] = state.split(".");
    assert.throws(() => verifySignedSportsEngineOauthState(`${payload}.bad`, "state-secret", 600));
  });
});

describe("sportsengine oauth dialog url", () => {
  it("builds dialog url with required fields", () => {
    const url = buildSportsEngineOauthDialogUrl(
      {
        clientId: "client-1",
        clientSecret: "secret-1",
        stateSecret: "state-1",
        redirectUri: "https://orgframe.test/api/integrations/sportsengine/oauth/callback",
        scopes: "read",
        apiBaseUrl: "https://api.sportngin.test",
        rosterEndpoint: "/v1/rosters",
        programsEndpoint: "/v1/programs"
      },
      "signed-state"
    );

    assert.equal(url.hostname, "user.sportngin.com");
    assert.equal(url.searchParams.get("client_id"), "client-1");
    assert.equal(url.searchParams.get("state"), "signed-state");
    assert.equal(url.searchParams.get("response_type"), "code");
  });
});

describe("sportsengine dataset normalization", () => {
  it("normalizes roster payload to people_roster schema", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              full_name: "Casey Nguyen",
              email: "casey.parent@example.com",
              jersey: "9",
              mobile: "(313) 555-9911",
              dob: "2012-09-11",
              team: "Tigers"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    try {
      const rows = await fetchSportsEngineDataset({
        config: {
          clientId: "client-1",
          clientSecret: "secret-1",
          stateSecret: "state-1",
          redirectUri: "https://orgframe.test/callback",
          scopes: "read",
          apiBaseUrl: "https://api.sportngin.test",
          rosterEndpoint: "/v1/rosters",
          programsEndpoint: "/v1/programs"
        },
        accessToken: "token",
        profileKey: "people_roster"
      });

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.display_name, "Casey Nguyen");
      assert.equal(rows[0]?.user_email, "casey.parent@example.com");
      assert.equal(rows[0]?.team_name, "Tigers");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
