import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const state = {
  reset() {
    this.seedCalled = false;
  },
  seedCalled: false
};

mock.module("@/src/shared/org/getOrgAuthContext", {
  namedExports: {
    getOrgAuthContext: async () => ({
      orgId: "org-1",
      orgSlug: "acme",
      membershipPermissions: ["facilities.write"]
    })
  }
});

mock.module("@/src/features/facilities/db/queries", {
  namedExports: {
    getFacilitySpaceById: async (_orgId: string, spaceId: string) => ({
      id: spaceId,
      orgId: "org-1",
      parentSpaceId: null,
      name: "Field 1",
      slug: "field-1",
      spaceKind: "field",
      status: "open",
      isBookable: true,
      timezone: "America/Detroit",
      capacity: null,
      metadataJson: {},
      statusLabelsJson: {},
      sortIndex: 1,
      createdAt: "",
      updatedAt: ""
    }),
    listFacilitySpacesForManage: async () => [
      {
        id: "space-1",
        orgId: "org-1",
        parentSpaceId: null,
        name: "Field 1",
        slug: "field-1",
        spaceKind: "field",
        status: "open",
        isBookable: true,
        timezone: "America/Detroit",
        capacity: null,
        metadataJson: {},
        statusLabelsJson: {},
        sortIndex: 1,
        createdAt: "",
        updatedAt: ""
      }
    ]
  }
});

mock.module("@/src/features/facilities/map/db/queries", {
  namedExports: {
    seedFacilityMapNodesForMissingSpaces: async () => {
      state.seedCalled = true;
    },
    listFacilityMapNodes: async () => [
      {
        id: "node-1",
        entityId: "space-1",
        parentEntityId: null,
        label: "Field 1",
        shapeType: "rectangle",
        points: [
          { x: 24, y: 24 },
          { x: 168, y: 24 },
          { x: 168, y: 120 },
          { x: 24, y: 120 }
        ],
        bounds: { x: 24, y: 24, width: 144, height: 96 },
        zIndex: 1,
        cornerRadius: 12,
        status: "active",
        orgId: "org-1",
        spaceId: "space-1",
        parentSpaceId: null
      }
    ]
  }
});

let getFacilityMapManageDetail!: typeof import("@/src/features/facilities/actions").getFacilityMapManageDetail;

before(async () => {
  ({ getFacilityMapManageDetail } = await import("@/src/features/facilities/actions"));
});

beforeEach(() => {
  state.reset();
});

describe("facility structure route data", () => {
  it("loads seeded map nodes for structure page", async () => {
    const detail = await getFacilityMapManageDetail("acme", "space-1");
    assert.equal(Boolean(detail), true);
    assert.equal(state.seedCalled, true);
    assert.equal(detail?.facility.id, "space-1");
    assert.equal(detail?.nodes.length, 1);
  });
});
