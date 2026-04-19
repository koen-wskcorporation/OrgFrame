import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANVAS_CORNER_RADIUS, CANVAS_GRID_SIZE } from "@/src/features/canvas/core/constants";
import { isNodeGeometryOnGrid, normalizeNodeGeometry } from "@/src/features/canvas/core/geometry";
import type { CanvasNode } from "@/src/features/canvas/core/types";

function buildNode(overrides?: Partial<CanvasNode>): CanvasNode {
  return {
    id: "node-1",
    entityId: "entity-1",
    parentEntityId: null,
    label: "Node",
    shapeType: "rectangle",
    points: [],
    bounds: {
      x: 13,
      y: 17,
      width: 55,
      height: 89
    },
    zIndex: 1,
    cornerRadius: 0,
    status: "active",
    ...overrides
  };
}

describe("facility map geometry normalization", () => {
  it("snaps rectangle geometry to grid and canonical radius", () => {
    const normalized = normalizeNodeGeometry(buildNode());
    assert.equal(normalized.bounds.x % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.bounds.y % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.bounds.width % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.bounds.height % CANVAS_GRID_SIZE, 0);
    assert.equal(normalized.cornerRadius, CANVAS_CORNER_RADIUS);
    assert.equal(isNodeGeometryOnGrid(normalized), true);
  });

  it("normalizes polygon points and derives valid bounds", () => {
    const normalized = normalizeNodeGeometry(
      buildNode({
        shapeType: "polygon",
        points: [
          { x: 11, y: 13 },
          { x: 97, y: 31 },
          { x: 64, y: 121 }
        ]
      })
    );

    assert.equal(normalized.points.length >= 3, true);
    assert.equal(isNodeGeometryOnGrid(normalized), true);
    assert.equal(normalized.bounds.width >= CANVAS_GRID_SIZE, true);
    assert.equal(normalized.bounds.height >= CANVAS_GRID_SIZE, true);
  });
});
