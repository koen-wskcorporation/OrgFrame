import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveCapabilities } from "@/src/features/ai/context/deriveCapabilities";

describe("deriveCapabilities", () => {
  it("maps alias permissions correctly", () => {
    const caps = deriveCapabilities(["calendar:create", "facilities:manage", "communications:send"]);

    assert.equal(caps.canCreateEvents, true);
    assert.equal(caps.canEditEvents, false);
    assert.equal(caps.canDeleteEvents, false);
    assert.equal(caps.canManageFacilities, true);
    assert.equal(caps.canSendCommunications, true);
  });

  it("maps dot permissions correctly", () => {
    const caps = deriveCapabilities(["calendar.write", "facilities.write", "communications.write"]);

    assert.equal(caps.canCreateEvents, true);
    assert.equal(caps.canEditEvents, true);
    assert.equal(caps.canDeleteEvents, true);
    assert.equal(caps.canManageFacilities, true);
    assert.equal(caps.canSendCommunications, true);
  });

  it("throws explicit invalid permissions error for unknown values", () => {
    assert.throws(() => deriveCapabilities(["calendar.write", "unknown:permission"]), (error: unknown) => {
      return error instanceof Error && (error as { code?: string }).code === "INVALID_PERMISSIONS";
    });
  });
});
