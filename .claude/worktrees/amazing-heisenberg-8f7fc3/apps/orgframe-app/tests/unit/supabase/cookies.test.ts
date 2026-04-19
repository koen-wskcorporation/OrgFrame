import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { normalizeSupabaseCookieOptions } from "@/src/shared/supabase/cookies";

const originalAuthCookieDomain = process.env.AUTH_COOKIE_DOMAIN;

afterEach(() => {
  if (originalAuthCookieDomain === undefined) {
    delete process.env.AUTH_COOKIE_DOMAIN;
  } else {
    process.env.AUTH_COOKIE_DOMAIN = originalAuthCookieDomain;
  }
});

describe("normalizeSupabaseCookieOptions", () => {
  it("shares auth cookies across production org subdomains by default", () => {
    delete process.env.AUTH_COOKIE_DOMAIN;

    const options = normalizeSupabaseCookieOptions(undefined, true, "baycitysoccer.orgframe.app");
    assert.equal(options.domain, "orgframe.app");
    assert.equal(options.path, "/");
    assert.equal(options.sameSite, "lax");
    assert.equal(options.secure, true);
  });

  it("shares auth cookies across staging org subdomains by default", () => {
    delete process.env.AUTH_COOKIE_DOMAIN;

    const options = normalizeSupabaseCookieOptions(undefined, true, "riverdale.staging.orgframe.app");
    assert.equal(options.domain, "staging.orgframe.app");
  });

  it("shares auth cookies across local test-domain org subdomains", () => {
    delete process.env.AUTH_COOKIE_DOMAIN;

    const options = normalizeSupabaseCookieOptions(undefined, false, "batmen.orgframe.test");
    assert.equal(options.domain, "orgframe.test");
  });

  it("does not force a shared domain for unrelated hosts", () => {
    delete process.env.AUTH_COOKIE_DOMAIN;

    const options = normalizeSupabaseCookieOptions(undefined, true, "example.com");
    assert.equal(options.domain, undefined);
  });

  it("respects explicit AUTH_COOKIE_DOMAIN override", () => {
    process.env.AUTH_COOKIE_DOMAIN = "orgframe.test";

    const options = normalizeSupabaseCookieOptions(undefined, true, "example.com");
    assert.equal(options.domain, "orgframe.test");
  });
});
