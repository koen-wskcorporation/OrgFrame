import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { getTenantBaseHosts } from "@/lib/domains/customDomains";
import { getLegacyOrgPathRedirect, proxy } from "@/proxy";

describe("legacy path redirect routing", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  before(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://orgframe.app";
  });

  after(() => {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  });

  it("redirects apex production path tenant URLs to production subdomains", () => {
    const redirect = getLegacyOrgPathRedirect("orgframe.app", "/baycitysoccer/schedule", getTenantBaseHosts());
    assert.deepEqual(redirect, {
      baseHost: "orgframe.app",
      orgSlug: "baycitysoccer",
      pathname: "/schedule"
    });
  });

  it("redirects apex staging path tenant URLs to staging subdomains", () => {
    const redirect = getLegacyOrgPathRedirect("staging.orgframe.app", "/baycitysoccer/schedule", getTenantBaseHosts());
    assert.deepEqual(redirect, {
      baseHost: "staging.orgframe.app",
      orgSlug: "baycitysoccer",
      pathname: "/schedule"
    });
  });

  it("does not redirect reserved and non-org paths", () => {
    assert.equal(getLegacyOrgPathRedirect("orgframe.app", "/auth/login", getTenantBaseHosts()), null);
    assert.equal(getLegacyOrgPathRedirect("orgframe.app", "/api/test", getTenantBaseHosts()), null);
    assert.equal(getLegacyOrgPathRedirect("orgframe.app", "/staging/tools", getTenantBaseHosts()), null);
  });

  it("preserves query strings during legacy redirects", async () => {
    const response = await proxy(
      new NextRequest("https://localhost/baycitysoccer/schedule?view=month", {
        headers: {
          "x-forwarded-host": "orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://baycitysoccer.orgframe.app/schedule?view=month");
  });

  it("removes visible org slug prefix on tenant subdomains", async () => {
    const response = await proxy(
      new NextRequest("https://localhost/baycitysoccer/tools/calendar?view=month", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://baycitysoccer.orgframe.app/tools/calendar?view=month");
  });
});
