import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getTenantBaseHosts, resolveOrgSubdomain } from "@/lib/domains/customDomains";

describe("tenant base host parsing", () => {
  const previousEnv = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    SITE_URL: process.env.SITE_URL,
    NEXT_PUBLIC_STAGING_SITE_URL: process.env.NEXT_PUBLIC_STAGING_SITE_URL,
    STAGING_SITE_URL: process.env.STAGING_SITE_URL
  };

  before(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://orgframe.app";
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_STAGING_SITE_URL;
    delete process.env.STAGING_SITE_URL;
  });

  after(() => {
    if (previousEnv.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousEnv.NEXT_PUBLIC_SITE_URL;
    if (previousEnv.SITE_URL === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousEnv.SITE_URL;
    if (previousEnv.NEXT_PUBLIC_STAGING_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_STAGING_SITE_URL;
    else process.env.NEXT_PUBLIC_STAGING_SITE_URL = previousEnv.NEXT_PUBLIC_STAGING_SITE_URL;
    if (previousEnv.STAGING_SITE_URL === undefined) delete process.env.STAGING_SITE_URL;
    else process.env.STAGING_SITE_URL = previousEnv.STAGING_SITE_URL;
  });

  it("resolves production and staging org subdomains", () => {
    const baseHosts = getTenantBaseHosts();
    const prod = resolveOrgSubdomain("baycitysoccer.orgframe.app", baseHosts);
    const staging = resolveOrgSubdomain("baycitysoccer.staging.orgframe.app", baseHosts);

    assert.deepEqual(prod, { orgSlug: "baycitysoccer", baseHost: "orgframe.app" });
    assert.deepEqual(staging, { orgSlug: "baycitysoccer", baseHost: "staging.orgframe.app" });
  });

  it("does not resolve reserved subdomains or apex hosts as orgs", () => {
    const baseHosts = getTenantBaseHosts();

    assert.equal(resolveOrgSubdomain("orgframe.app", baseHosts), null);
    assert.equal(resolveOrgSubdomain("staging.orgframe.app", baseHosts), null);
    assert.equal(resolveOrgSubdomain("www.orgframe.app", baseHosts), null);
    assert.equal(resolveOrgSubdomain("api.staging.orgframe.app", baseHosts), null);
  });

  it("does not treat custom domains as platform subdomains", () => {
    const baseHosts = getTenantBaseHosts();
    assert.equal(resolveOrgSubdomain("club.example.com", baseHosts), null);
  });
});
