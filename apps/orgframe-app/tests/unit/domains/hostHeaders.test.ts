import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";

describe("parseHostWithPort", () => {
  it("keeps localhost dev port from host header", () => {
    assert.deepEqual(parseHostWithPort("localhost:3000"), {
      host: "localhost",
      port: "3000",
      hostWithPort: "localhost:3000"
    });
  });

  it("uses the first forwarded host entry", () => {
    assert.deepEqual(parseHostWithPort("mgsll.localhost:3000, localhost:3000"), {
      host: "mgsll.localhost",
      port: "3000",
      hostWithPort: "mgsll.localhost:3000"
    });
  });

  it("returns empty values for missing headers", () => {
    assert.deepEqual(parseHostWithPort(null), {
      host: "",
      port: "",
      hostWithPort: ""
    });
  });
});
