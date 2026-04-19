import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SMART_IMPORT_AUTO_APPLY_THRESHOLD, shouldAutoApplyResolution } from "@/src/features/imports/ai";

describe("smart import auto-apply threshold", () => {
  it("uses 0.85 as the minimum auto-apply confidence", () => {
    assert.equal(SMART_IMPORT_AUTO_APPLY_THRESHOLD, 0.85);
    assert.equal(shouldAutoApplyResolution(0.8499), false);
    assert.equal(shouldAutoApplyResolution(0.85), true);
    assert.equal(shouldAutoApplyResolution(0.99), true);
  });
});
