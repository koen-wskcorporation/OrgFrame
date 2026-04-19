import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOrgToolAvailability } from "@/src/features/core/config/tools";

describe("resolveOrgToolAvailability (AI-first)", () => {
  it("disables sports-ops tools when ORGFRAME_AI_FIRST_MODE=true", () => {
    const previous = process.env.ORGFRAME_AI_FIRST_MODE;
    process.env.ORGFRAME_AI_FIRST_MODE = "true";

    const resolved = resolveOrgToolAvailability({});
    assert.equal(resolved.people, false);
    assert.equal(resolved.programs, false);
    assert.equal(resolved.calendar, false);
    assert.equal(resolved.facilities, false);
    assert.equal(resolved.forms, false);
    assert.equal(resolved.inbox, false);
    assert.equal(resolved.imports, true);
    assert.equal(resolved.billing, true);

    if (typeof previous === "string") {
      process.env.ORGFRAME_AI_FIRST_MODE = previous;
    } else {
      delete process.env.ORGFRAME_AI_FIRST_MODE;
    }
  });
});
