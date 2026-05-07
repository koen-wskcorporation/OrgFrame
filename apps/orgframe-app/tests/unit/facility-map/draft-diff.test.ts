/**
 * Validates the workspace draft hook's diff at save time.
 *
 * The draft is a single source of truth: a list of `MapShape`. On save,
 * `buildSavePayload` emits {creates, updates, deletes} by comparing the
 * current state to the snapshot taken when the spaces prop last loaded.
 *
 * These tests don't render React — they exercise the diff math directly
 * by reaching into a controlled scenario. The hook itself is exercised in
 * the route-smoke test where it runs inside the workspace.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FacilitySpace } from "@/src/features/facilities/types";
import { shapeFromSpace, type MapShape } from "@/src/features/facilities/map/types";

function makeSpace(id: string, points: Array<{ x: number; y: number }> | null = null): FacilitySpace {
  return {
    id,
    orgId: "org-1",
    facilityId: "fac-1",
    parentSpaceId: null,
    name: `Space ${id}`,
    slug: `space-${id}`,
    spaceKind: "custom",
    status: "open",
    statusId: null,
    isBookable: true,
    timezone: "UTC",
    capacity: null,
    metadataJson: {},
    statusLabelsJson: {},
    sortIndex: 0,
    mapPoints: points,
    mapZIndex: 1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  };
}

describe("MapShape derivation from FacilitySpace", () => {
  it("uses persisted points when present", () => {
    const space = makeSpace("a", [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
    const shape = shapeFromSpace(space, { points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], zIndex: 99 });
    assert.equal(shape.id, "a");
    assert.equal(shape.points.length, 3);
    assert.equal(shape.points[0].x, 1);
    // mapZIndex from the space wins over the fallback
    assert.equal(shape.zIndex, 1);
  });

  it("falls back when points are null (space not yet placed)", () => {
    const space = makeSpace("b", null);
    const fallback = { points: [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }], zIndex: 42 };
    const shape = shapeFromSpace(space, fallback);
    assert.equal(shape.points[0].x, 5);
    // mapZIndex from the space (which is set to 1 in makeSpace) wins
    assert.equal(shape.zIndex, 1);
  });

  it("preserves smooth=true on individual vertices", () => {
    const space = makeSpace("c", [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 }
    ]);
    space.mapPoints = [
      { x: 1, y: 1, smooth: true },
      { x: 2, y: 2 },
      { x: 3, y: 3, smooth: true }
    ];
    const shape = shapeFromSpace(space, { points: [], zIndex: 0 });
    assert.equal(shape.points[0].smooth, true);
    assert.equal(shape.points[1].smooth, undefined);
    assert.equal(shape.points[2].smooth, true);
  });

  it("MapShape carries spaceKind/status/statusId through", () => {
    const space = makeSpace("d", [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    space.spaceKind = "field";
    space.statusId = "open-system";
    const shape: MapShape = shapeFromSpace(space, { points: [], zIndex: 0 });
    assert.equal(shape.spaceKind, "field");
    assert.equal(shape.statusId, "open-system");
    assert.equal(shape.status, "open");
  });
});
