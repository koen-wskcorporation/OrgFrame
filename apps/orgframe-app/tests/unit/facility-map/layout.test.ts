import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boxesOverlap, normalizeLayout } from "@/src/features/canvas/core/layout";
import type { CanvasNode } from "@/src/features/canvas/core/types";

function buildNode(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    entityId: id,
    parentEntityId: null,
    label: id,
    points: [],
    bounds: {
      x,
      y,
      width: 120,
      height: 72
    },
    zIndex: 1,
    cornerRadius: 0,
    status: "active"
  };
}

describe("facility map layout normalization", () => {
  it("pushes overlapping nodes apart deterministically", () => {
    const nodes = [buildNode("a", 48, 48), buildNode("b", 48, 48), buildNode("c", 48, 48)];
    const normalized = normalizeLayout(nodes);

    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        assert.equal(boxesOverlap(normalized[i].bounds, normalized[j].bounds), false);
      }
    }
  });

  it("keeps deterministic order by z-index then id", () => {
    const nodes = [buildNode("b", 48, 48), buildNode("a", 48, 48)];
    nodes[0].zIndex = 2;
    nodes[1].zIndex = 2;

    const normalized = normalizeLayout(nodes);
    const ids = normalized.map((node) => node.id);
    assert.deepEqual(ids, ["a", "b"]);
  });
});
