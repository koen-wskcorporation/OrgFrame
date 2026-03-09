export type FacilityStatus = "open" | "closed" | "archived";

export type FacilityType = "park" | "complex" | "building" | "campus" | "field_cluster" | "gym" | "indoor" | "custom";

export type FacilityNodeKind =
  | "facility"
  | "zone"
  | "building"
  | "section"
  | "field"
  | "court"
  | "diamond"
  | "rink"
  | "room"
  | "amenity"
  | "parking"
  | "support_area"
  | "custom";

export type FacilityNodeShape = "rect" | "pill";

export type FacilityNodeLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  shape: FacilityNodeShape;
  containerMode: "free" | "stack";
};

export type Facility = {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  facilityType: FacilityType;
  status: FacilityStatus;
  timezone: string;
  metadataJson: Record<string, unknown>;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type FacilityNode = {
  id: string;
  orgId: string;
  facilityId: string;
  parentNodeId: string | null;
  name: string;
  slug: string;
  nodeKind: FacilityNodeKind;
  status: FacilityStatus;
  isBookable: boolean;
  capacity: number | null;
  layout: FacilityNodeLayout;
  metadataJson: Record<string, unknown>;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type FacilityMapReadModel = {
  facilities: Facility[];
  nodes: FacilityNode[];
};

export type FacilityBookingSelectionPayload = {
  occurrenceId: string;
  facilityId: string;
  nodeIds: string[];
};

export type FacilityNodeAvailabilityState = "available" | "unavailable" | "selected" | "non_bookable";

export type FacilityBookingMapSnapshot = {
  occurrenceId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  facilities: Facility[];
  nodes: FacilityNode[];
  selectedNodeIds: string[];
  unavailableNodeIds: string[];
};

export type FacilityPublicSpaceStatus = "open" | "closed" | "booked";

export type FacilityPublicReservation = {
  id: string;
  spaceId: string;
  reservationKind: "booking";
  status: "approved";
  publicLabel: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
};

export type FacilityPublicSpaceAvailability = {
  id: string;
  parentSpaceId: string | null;
  name: string;
  slug: string;
  spaceKind: FacilityNodeKind;
  spaceTypeKey: FacilityNodeKind;
  status: FacilityStatus;
  isBookable: boolean;
  timezone: string;
  currentStatus: FacilityPublicSpaceStatus;
  nextAvailableAtUtc: string | null;
};

export type FacilityPublicAvailabilitySnapshot = {
  generatedAtUtc: string;
  spaces: FacilityPublicSpaceAvailability[];
  reservations: FacilityPublicReservation[];
};
