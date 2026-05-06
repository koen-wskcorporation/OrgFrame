import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { getTenantBaseHosts, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";

describe("tenant base host parsing", () => {
  const previousEnv = {
    NEXT_PUBLIC_PLATFORM_HOST: process.env.NEXT_PUBLIC_PLATFORM_HOST
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PLATFORM_HOST;
  });

  after(() => {
    if (previousEnv.NEXT_PUBLIC_PLATFORM_HOST === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_HOST;
    else process.env.NEXT_PUBLIC_PLATFORM_HOST = previousEnv.NEXT_PUBLIC_PLATFORM_HOST;
  });

  it("resolves org subdomains under the configured production platform host", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.app";
    const baseHosts = getTenantBaseHosts();
    assert.deepEqual(
      resolveOrgSubdomain("baycitysoccer.orgframe.app", baseHosts),
      { orgSlug: "baycitysoccer", baseHost: "orgframe.app" }
    );
  });

  it("resolves org subdomains under a staging platform host", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "staging.orgframe.app";
    const baseHosts = getTenantBaseHosts();
    assert.deepEqual(
      resolveOrgSubdomain("baycitysoccer.staging.orgframe.app", baseHosts),
      { orgSlug: "baycitysoccer", baseHost: "staging.orgframe.app" }
    );
  });

  it("resolves org subdomains under a local-dev platform host", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.test";
    const baseHosts = getTenantBaseHosts();
    assert.deepEqual(
      resolveOrgSubdomain("baycitysoccer.orgframe.test", baseHosts),
      { orgSlug: "baycitysoccer", baseHost: "orgframe.test" }
    );
  });

  it("does not resolve reserved subdomains or apex hosts as orgs", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.app";
    const baseHosts = getTenantBaseHosts();

    assert.equal(resolveOrgSubdomain("orgframe.app", baseHosts), null);
    assert.equal(resolveOrgSubdomain("www.orgframe.app", baseHosts), null);
    assert.equal(resolveOrgSubdomain("auth.orgframe.app", baseHosts), null);
  });

  it("does not treat custom domains as platform subdomains", () => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.app";
    const baseHosts = getTenantBaseHosts();
    assert.equal(resolveOrgSubdomain("club.example.com", baseHosts), null);
  });
});
