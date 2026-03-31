import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { getTenantBaseHosts } from "@/src/shared/domains/customDomains";
import { getCustomDomainRedirectHost, getLegacyOrgPathRedirect, proxy } from "@/proxy";

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

  it("sends platform-only routes on org subdomains to the app host", async () => {
    const response = await proxy(
      new NextRequest("https://localhost/auth/login?next=%2Ftools", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://orgframe.app/auth/login?next=%2Ftools");
  });

  it("sends account and api routes on org subdomains to the app host", async () => {
    const accountResponse = await proxy(
      new NextRequest("https://localhost/account", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(accountResponse.status, 307);
    assert.equal(accountResponse.headers.get("location"), "https://orgframe.app/account");

    const apiResponse = await proxy(
      new NextRequest("https://localhost/api/account/session", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(apiResponse.status, 307);
    assert.equal(apiResponse.headers.get("location"), "https://orgframe.app/api/account/session");
  });

  it("keeps org-scoped routes on custom domains", () => {
    const redirectHost = getCustomDomainRedirectHost("/tools/calendar", "baycitysoccer");
    assert.equal(redirectHost, null);
  });

  it("sends platform-only routes on custom domains to the app host", () => {
    assert.equal(getCustomDomainRedirectHost("/auth/login", "baycitysoccer"), "orgframe.app");
    assert.equal(getCustomDomainRedirectHost("/account", "baycitysoccer"), "orgframe.app");
  });

  it("keeps nested paths on custom domains within org scope", () => {
    const redirectHost = getCustomDomainRedirectHost("/riverdale/programs/spring", "baycitysoccer");
    assert.equal(redirectHost, null);
  });
});
