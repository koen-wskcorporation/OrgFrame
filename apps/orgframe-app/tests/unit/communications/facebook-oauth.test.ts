import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFacebookOauthDialogUrl,
  createSignedFacebookOauthState,
  verifySignedFacebookOauthState
} from "@/src/features/communications/integrations/facebook-oauth";

describe("facebook oauth state", () => {
  it("signs and verifies oauth state", () => {
    const state = createSignedFacebookOauthState(
      {
        orgSlug: "acme",
        userId: "user-123",
        origin: "https://orgframe.test"
      },
      "state-secret"
    );

    const parsed = verifySignedFacebookOauthState(state, "state-secret", 600);
    assert.equal(parsed.orgSlug, "acme");
    assert.equal(parsed.userId, "user-123");
    assert.equal(parsed.origin, "https://orgframe.test");
  });

  it("rejects tampered state", () => {
    const state = createSignedFacebookOauthState(
      {
        orgSlug: "acme",
        userId: "user-123",
        origin: "https://orgframe.test"
      },
      "state-secret"
    );

    const [payload] = state.split(".");
    assert.throws(() => verifySignedFacebookOauthState(`${payload}.bad`, "state-secret", 600));
  });
});

describe("facebook oauth dialog url", () => {
  it("builds dialog url with required fields", () => {
    const url = buildFacebookOauthDialogUrl(
      {
        appId: "123",
        appSecret: "secret",
        stateSecret: "state",
        redirectUri: "https://orgframe.test/api/integrations/facebook/oauth/callback",
        scopes: "pages_show_list,pages_manage_metadata,pages_messaging"
      },
      "signed-state"
    );

    assert.equal(url.hostname, "www.facebook.com");
    assert.equal(url.searchParams.get("client_id"), "123");
    assert.equal(url.searchParams.get("state"), "signed-state");
    assert.equal(url.searchParams.get("display"), "popup");
  });
});
