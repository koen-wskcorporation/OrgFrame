import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCrossAppOrigin } from "@/lib/cross-app-origin";

describe("cross app origin resolution", () => {
  it("does not rewrite apex orgframe.app to .web", () => {
    const request = new Request("https://orgframe.app/x/web");
    const resolved = resolveCrossAppOrigin(request, "web");
    assert.equal(resolved, "https://orgframe.app");
  });

  it("still rewrites explicit app/web service subdomains", () => {
    const request = new Request("https://app.preview.orgframe.app/x/web");
    const resolved = resolveCrossAppOrigin(request, "web");
    assert.equal(resolved, "https://web.preview.orgframe.app");
  });

  it("maps vercel app deployments to web deployments without using .web tld", () => {
    const request = new Request("https://orgframe-app-mcm7yavzu-orgframe.vercel.app/x/web");
    const resolved = resolveCrossAppOrigin(request, "web");
    assert.equal(resolved, "https://orgframe-web-mcm7yavzu-orgframe.vercel.app");
    assert.equal(new URL(resolved).hostname.endsWith(".web"), false);
  });
});
