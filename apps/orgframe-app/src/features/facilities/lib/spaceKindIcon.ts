/**
 * Icon + label registry for `FacilitySpaceKind`. Generic structural kinds
 * (building / floor / room / field / court / custom) deliberately have no
 * icon — they're abstract slots whose meaning comes from context. The typed
 * kinds (bathroom, parking_lot, etc.) get a fixed lucide glyph so they're
 * recognizable at a glance on the map.
 */

import type { LucideIcon } from "lucide-react";
import { Briefcase, Coffee, Package, SquareParking, Sofa, Toilet } from "lucide-react";
import type { FacilitySpaceKind } from "@/src/features/facilities/types";

export const SPACE_KIND_LABEL: Record<FacilitySpaceKind, string> = {
  building: "Building",
  floor: "Floor",
  room: "Room",
  field: "Field",
  court: "Court",
  custom: "Custom",
  bathroom: "Restroom",
  parking_lot: "Parking lot",
  lobby: "Lobby",
  office: "Office",
  kitchen: "Kitchen",
  storage: "Storage"
};

/**
 * Single source of truth for the dropdown order shown in the wizard, the
 * map side panel, and the tree editor. Keeps the structural kinds first,
 * typed/iconographic kinds in the middle, and "custom" as the catch-all.
 */
export const SPACE_KIND_OPTIONS: Array<{ value: FacilitySpaceKind; label: string }> = [
  { value: "building", label: SPACE_KIND_LABEL.building },
  { value: "floor", label: SPACE_KIND_LABEL.floor },
  { value: "room", label: SPACE_KIND_LABEL.room },
  { value: "court", label: SPACE_KIND_LABEL.court },
  { value: "field", label: SPACE_KIND_LABEL.field },
  { value: "bathroom", label: SPACE_KIND_LABEL.bathroom },
  { value: "parking_lot", label: SPACE_KIND_LABEL.parking_lot },
  { value: "lobby", label: SPACE_KIND_LABEL.lobby },
  { value: "office", label: SPACE_KIND_LABEL.office },
  { value: "kitchen", label: SPACE_KIND_LABEL.kitchen },
  { value: "storage", label: SPACE_KIND_LABEL.storage },
  { value: "custom", label: SPACE_KIND_LABEL.custom }
];

const KIND_ICONS: Partial<Record<FacilitySpaceKind, LucideIcon>> = {
  bathroom: Toilet,
  parking_lot: SquareParking,
  lobby: Sofa,
  office: Briefcase,
  kitchen: Coffee,
  storage: Package
};

export function getSpaceKindIcon(kind: FacilitySpaceKind): LucideIcon | null {
  return KIND_ICONS[kind] ?? null;
}
