import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { normalizeSupabaseCookieOptions } from "@/src/shared/supabase/cookies";

const originalPlatformHost = process.env.NEXT_PUBLIC_PLATFORM_HOST;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_PLATFORM_HOST;
});

afterEach(() => {
  if (originalPlatformHost === undefined) {
    delete process.env.NEXT_PUBLIC_PLATFORM_HOST;
  } else {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = originalPlatformHost;
  }
});

describe("normalizeSupabaseCookieOptions", () => {
  it("shares auth cookies across production org subdomains", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.app";
    const options = normalizeSupabaseCookieOptions(undefined, true, "baycitysoccer.orgframe.app");
    assert.equal(options.domain, "orgframe.app");
    assert.equal(options.path, "/");
    assert.equal(options.sameSite, "lax");
    assert.equal(options.secure, true);
  });

  it("shares auth cookies across staging org subdomains", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "staging.orgframe.app";
    const options = normalizeSupabaseCookieOptions(undefined, true, "riverdale.staging.orgframe.app");
    assert.equal(options.domain, "staging.orgframe.app");
  });

  it("shares auth cookies across local test-domain org subdomains", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.test";
    const options = normalizeSupabaseCookieOptions(undefined, false, "batmen.orgframe.test");
    assert.equal(options.domain, "orgframe.test");
  });

  it("does not force a shared domain for unrelated hosts", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.app";
    const options = normalizeSupabaseCookieOptions(undefined, true, "example.com");
    assert.equal(options.domain, undefined);
  });
});
