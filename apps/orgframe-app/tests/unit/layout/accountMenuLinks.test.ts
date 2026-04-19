import assert from "node:assert/strict";
import { describe, it } from "node:test";

function buildOrgSwitchHrefLikeApp(
  targetOrgSlug: string,
  pathname: string,
  currentOrgSlug: string,
  tenantBaseHost: string,
  tenantBaseAuthority: string,
  tenantBaseProtocol: string,
  _currentHost: string
) {
  const normalizedPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";
  const pathSuffix = (() => {
    const segments = normalizedPath.split("/").filter(Boolean);
    if (!segments.length) return "/";
    if (currentOrgSlug && segments[0] === currentOrgSlug) {
      return segments.length === 1 ? "/" : `/${segments.slice(1).join("/")}`;
    }
    return `/${segments.join("/")}`;
  })();

  if (tenantBaseAuthority) {
    return `${tenantBaseProtocol}//${targetOrgSlug}.${tenantBaseAuthority}${pathSuffix}`;
  }

  return pathSuffix === "/" ? `/${targetOrgSlug}` : `/${targetOrgSlug}${pathSuffix}`;
}

describe("Account menu org switch hrefs", () => {
  it("uses subdomain hrefs on local tenant base hosts", () => {
    const href = buildOrgSwitchHrefLikeApp(
      "batmen",
      "/mgsll/manage",
      "mgsll",
      "orgframe.test",
      "orgframe.test:3000",
      "http:",
      "mgsll.orgframe.test"
    );

    assert.equal(href, "http://batmen.orgframe.test:3000/manage");
  });
});
