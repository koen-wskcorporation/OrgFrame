import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveScope } from "@/src/features/ai/context/resolveScope";

describe("resolveScope", () => {
  it("parses /calendar", () => {
    assert.deepEqual(resolveScope("/calendar"), {
      currentModule: "calendar",
      entityType: undefined,
      entityId: undefined
    });
  });

  it("parses /programs/:id", () => {
    assert.deepEqual(resolveScope("/programs/prog-1"), {
      currentModule: "programs",
      entityType: "program",
      entityId: "prog-1"
    });
  });

  it("parses /teams/:id", () => {
    assert.deepEqual(resolveScope("/teams/team-1"), {
      currentModule: "teams",
      entityType: "team",
      entityId: "team-1"
    });
  });

  it("parses /tools/facilities/:id", () => {
    assert.deepEqual(resolveScope("/tools/facilities/space-1"), {
      currentModule: "facilities",
      entityType: "facility",
      entityId: "space-1"
    });
  });

  it("parses /account/players", () => {
    assert.deepEqual(resolveScope("/account/players"), {
      currentModule: "players"
    });
  });

  it("returns unknown for unsupported routes", () => {
    assert.deepEqual(resolveScope("/something/else"), {
      currentModule: "unknown"
    });
  });
});
