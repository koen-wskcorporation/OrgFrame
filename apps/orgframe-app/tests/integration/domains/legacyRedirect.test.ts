import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { getTenantBaseHosts } from "@/src/shared/domains/customDomains";
import {
  getCustomDomainRedirectHost,
  getLegacyOrgPathRedirect,
  proxy,
  resolveProxyRequestHost,
  resolveProxyRequestHostForRouting
} from "@/proxy";

describe("legacy path redirect routing", () => {
  const previousPlatformHost = process.env.NEXT_PUBLIC_PLATFORM_HOST;
  const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousSupabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  before(() => {
    process.env.NEXT_PUBLIC_PLATFORM_HOST = "orgframe.app";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "test-key";
  });

  after(() => {
    if (previousPlatformHost === undefined) {
      delete process.env.NEXT_PUBLIC_PLATFORM_HOST;
    } else {
      process.env.NEXT_PUBLIC_PLATFORM_HOST = previousPlatformHost;
    }

    if (previousSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
    }

    if (previousSupabasePublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = previousSupabasePublishableKey;
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

  it("redirects local test-domain path tenant URLs to subdomains", () => {
    const redirect = getLegacyOrgPathRedirect("orgframe.test", "/baycitysoccer/schedule", getTenantBaseHosts());
    assert.deepEqual(redirect, {
      baseHost: "orgframe.test",
      orgSlug: "baycitysoccer",
      pathname: "/schedule"
    });
  });

  it("does not redirect reserved and non-org paths", () => {
    assert.equal(getLegacyOrgPathRedirect("orgframe.app", "/auth/login", getTenantBaseHosts()), null);
    assert.equal(getLegacyOrgPathRedirect("orgframe.app", "/api/test", getTenantBaseHosts()), null);
    assert.equal(getLegacyOrgPathRedirect("orgframe.app", "/staging/manage", getTenantBaseHosts()), null);
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
      new NextRequest("https://localhost/baycitysoccer/manage/calendar?view=month", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://baycitysoccer.orgframe.app/manage/calendar?view=month");
  });

  it("sends platform-only routes on org subdomains to the app host", async () => {
    const response = await proxy(
      new NextRequest("https://localhost/auth/login?next=%2Fmanage", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://orgframe.app/auth/login?next=%2Fmanage");
  });

  it("rewrites local test-domain org subdomains to org path-style routes without redirect loops", async () => {
    const response = await proxy(
      new NextRequest("http://orgframe.test/manage/calendar?view=month", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.test:3000",
          "x-forwarded-proto": "http"
        }
      })
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-rewrite"), "http://orgframe.test/baycitysoccer/manage/calendar?view=month");
  });

  it("prefers canonical non-local host headers over forwarded host values", () => {
    const parsed = resolveProxyRequestHost(
      new NextRequest("https://orgframe.app/auth/login?next=%2Fmanage", {
        headers: {
          host: "orgframe.app",
          "x-forwarded-host": "baycitysoccer.orgframe.app"
        }
      })
    );

    assert.equal(parsed.host, "orgframe.app");
  });

  it("prefers org-subdomain host candidates for routing in local dev", () => {
    const parsed = resolveProxyRequestHostForRouting(
      new NextRequest("http://localhost/", {
        headers: {
          host: "orgframe.test:3000",
          "x-forwarded-host": "mgsll.orgframe.test:3000"
        }
      }),
      getTenantBaseHosts()
    );

    assert.equal(parsed.host, "mgsll.orgframe.test");
  });

  it("sends account routes on org subdomains to the app host", async () => {
    const accountResponse = await proxy(
      new NextRequest("https://localhost/settings", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(accountResponse.status, 307);
    assert.equal(accountResponse.headers.get("location"), "https://orgframe.app/settings");
  });

  it("keeps api routes on org subdomains same-origin", async () => {
    const apiResponse = await proxy(
      new NextRequest("https://localhost/api/account/session", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(apiResponse.status, 200);
    assert.equal(apiResponse.headers.get("location"), null);
  });

  it("keeps api fetch requests on org subdomains same-origin to avoid cross-origin fetch failures", async () => {
    const apiResponse = await proxy(
      new NextRequest("https://localhost/api/account/session", {
        headers: {
          "x-forwarded-host": "baycitysoccer.orgframe.app",
          "x-forwarded-proto": "https",
          "sec-fetch-dest": "empty"
        }
      })
    );

    assert.equal(apiResponse.status, 200);
    assert.equal(apiResponse.headers.get("location"), null);
  });

  it("sends platform-only routes on custom domains to the app host", () => {
    assert.equal(getCustomDomainRedirectHost("/auth/login", "baycitysoccer"), "orgframe.app");
    assert.equal(getCustomDomainRedirectHost("/settings", "baycitysoccer"), "orgframe.app");
  });

  it("sends authenticated org routes on custom domains to canonical org subdomains", () => {
    assert.equal(getCustomDomainRedirectHost("/manage/calendar", "baycitysoccer"), "baycitysoccer.orgframe.app");
  });

  it("keeps nested paths on custom domains within org scope", () => {
    const redirectHost = getCustomDomainRedirectHost("/riverdale/programs/spring", "baycitysoccer");
    assert.equal(redirectHost, null);
  });

  it("always sends auth routes from unknown hosts to the root app host", async () => {
    const response = await proxy(
      new NextRequest("https://localhost/auth/login", {
        headers: {
          "x-forwarded-host": "unknown.example.com",
          "x-forwarded-proto": "https"
        }
      })
    );

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://orgframe.app/auth/login");
  });
});
