/**
 * Round-trips the facility manage page loader. After the schema collapse
 * there is no separate map_nodes table — geometry lives on `spaces` —
 * so the loader is just `getFacilityById` + `listFacilitySpacesForManage`.
 *
 * No seeder, no orphan cleanup, no separate node list to read back.
 */
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

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
    BUILT_IN_FACILITY_SPACE_STATUSES: [],
    createFacilityRecord: async () => ({}),
    createFacilitySpaceRecord: async () => ({}),
    deleteFacilityRecord: async () => undefined,
    deleteFacilitySpaceRecord: async () => undefined,
    getFacilityById: async (_orgId: string, facilityId: string) => ({
      id: facilityId,
      orgId: "org-1",
      name: "Main Park",
      slug: "main-park",
      status: "active",
      timezone: "America/Detroit",
      environment: "outdoor",
      geoAnchorLat: null,
      geoAnchorLng: null,
      geoAddress: null,
      geoShowMap: false,
      metadataJson: {},
      sortIndex: 0,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    }),
    getFacilitySpaceById: async () => null,
    listFacilitiesForManage: async () => [],
    listFacilityReservationReadModel: async () => ({
      facilities: [],
      spaces: [],
      spaceStatuses: [],
      rules: [],
      reservations: [],
      exceptions: []
    }),
    listFacilitySpacesForManage: async () => [
      {
        id: "space-1",
        orgId: "org-1",
        facilityId: "fac-1",
        parentSpaceId: null,
        name: "Field 1",
        slug: "field-1",
        spaceKind: "field",
        status: "open",
        statusId: null,
        isBookable: true,
        timezone: "America/Detroit",
        capacity: null,
        metadataJson: {},
        statusLabelsJson: {},
        sortIndex: 1,
        mapPoints: [
          { x: 24, y: 24 },
          { x: 168, y: 24 },
          { x: 168, y: 120 },
          { x: 24, y: 120 }
        ],
        mapZIndex: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      }
    ],
    updateFacilityRecord: async () => ({}),
    updateFacilitySpaceMapRecord: async () => undefined,
    updateFacilitySpaceRecord: async () => undefined
  }
});

let getFacilityMapManageDetail!: typeof import("@/src/features/facilities/actions").getFacilityMapManageDetail;

before(async () => {
  ({ getFacilityMapManageDetail } = await import("@/src/features/facilities/actions"));
});

describe("facility manage route loader", () => {
  it("returns the facility and its scoped spaces (geometry on the row)", async () => {
    const detail = await getFacilityMapManageDetail("acme", "fac-1");
    assert.ok(detail, "loader returned a detail object");
    assert.equal(detail!.facility.id, "fac-1");
    assert.equal(detail!.spaces.length, 1);
    assert.equal(detail!.spaces[0].id, "space-1");
    assert.ok(Array.isArray(detail!.spaces[0].mapPoints));
    assert.equal(detail!.spaces[0].mapPoints!.length, 4);
  });
});
