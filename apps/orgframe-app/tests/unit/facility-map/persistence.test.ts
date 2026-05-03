import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS_CORNER_RADIUS, CANVAS_GRID_SIZE } from "@/src/features/canvas/core/constants";
import { normalizeFacilityMapNodesForPersistence } from "@/src/features/facilities/map/db/queries";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";

function buildNode(overrides?: Partial<FacilityMapNode>): FacilityMapNode {
  return {
    id: "node-1",
    entityId: "00000000-0000-0000-0000-000000000001",
    parentEntityId: null,
    label: "Field 1",
    points: [],
    bounds: {
      x: 11,
      y: 19,
      width: 101,
      height: 77
    },
    zIndex: 1,
    cornerRadius: 3,
    status: "active",
    orgId: "00000000-0000-0000-0000-000000000100",
    spaceId: "00000000-0000-0000-0000-000000000001",
    parentSpaceId: null,
    ...overrides
  };
}

describe("facility map persistence normalization", () => {
  it("enforces snapped geometry and canonical radius before persistence", () => {
    const [normalized] = normalizeFacilityMapNodesForPersistence([buildNode()]);
    assert.equal(normalized.cornerRadius, CANVAS_CORNER_RADIUS);
    assert.equal(normalized.bounds.x % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.bounds.y % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.bounds.width % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.bounds.height % CANVAS_GRID_SIZE, 0);
  });

  it("normalizes invalid polygon payloads into valid persisted geometry", () => {
    const [normalized] = normalizeFacilityMapNodesForPersistence([
      buildNode({
        id: "node-2",
        points: [{ x: 11, y: 11 }, { x: 32, y: 19 }]
      })
    ]);

    assert.equal(normalized.points.length >= 3, true);
    assert.equal(normalized.points.every((point) => point.x % CANVAS_GRID_SIZE === 0 && point.y % CANVAS_GRID_SIZE === 0), true);
  });
});
