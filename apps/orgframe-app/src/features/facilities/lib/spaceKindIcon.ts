/**
 * Icon + label + bookability registry for `FacilitySpaceKind`.
 *
 * Some kinds are inherently non-bookable infrastructure (bathrooms,
 * parking lots, storage). For those we hide the "Bookable" toggle in
 * the side panel and always persist `is_bookable=false`. The set is
 * codified in `KIND_BOOKABILITY` below — the single source of truth.
 */

import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Flag,
  LandPlot,
  Package,
  Shapes,
  SquareParking,
  Sofa,
  Tent,
  Toilet,
  UtensilsCrossed,
  Volleyball
} from "lucide-react";
import type { FacilitySpaceKind } from "@/src/features/facilities/types";

export const SPACE_KIND_LABEL: Record<FacilitySpaceKind, string> = {
  building: "Building",
  field: "Field",
  court: "Court",
  pavilion: "Pavilion",
  concessions: "Concessions",
  lobby: "Lobby",
  bathroom: "Restroom",
  parking_lot: "Parking lot",
  storage: "Storage",
  custom: "Custom"
};

const KIND_ICONS: Record<FacilitySpaceKind, LucideIcon> = {
  building: Building2,
  field: LandPlot,
  court: Volleyball,
  pavilion: Tent,
  concessions: UtensilsCrossed,
  lobby: Sofa,
  bathroom: Toilet,
  parking_lot: SquareParking,
  storage: Package,
  custom: Shapes
};

/**
 * Whether a kind makes sense to expose as a bookable resource. The
 * panel's "Bookable" toggle is suppressed for `false` entries, and
 * picking such a kind force-sets `is_bookable=false` so the on-canvas
 * hatched-fill rendering reads as "you can't book this" by default.
 *
 * `Flag` (unused so far in this file) is retained on the import in case
 * future kinds want a generic flag glyph; remove if we add another
 * one with its own icon.
 */
export const KIND_BOOKABILITY: Record<FacilitySpaceKind, boolean> = {
  building: true,
  field: true,
  court: true,
  pavilion: true,
  concessions: true,
  lobby: false,
  bathroom: false,
  parking_lot: false,
  storage: false,
  custom: true
};
void Flag;

export function getSpaceKindIcon(kind: FacilitySpaceKind): LucideIcon {
  return KIND_ICONS[kind];
}

export function isKindBookable(kind: FacilitySpaceKind): boolean {
  return KIND_BOOKABILITY[kind] ?? true;
}

/**
 * Single source of truth for the dropdown order shown in the wizard, the
 * map side panel, and the tree editor. Bookable kinds first (you'll
 * pick these most often), infrastructure last, custom as the catch-all.
 */
export const SPACE_KIND_OPTIONS: Array<{ value: FacilitySpaceKind; label: string; icon: LucideIcon }> = [
  { value: "building", label: SPACE_KIND_LABEL.building, icon: Building2 },
  { value: "field", label: SPACE_KIND_LABEL.field, icon: LandPlot },
  { value: "court", label: SPACE_KIND_LABEL.court, icon: Volleyball },
  { value: "pavilion", label: SPACE_KIND_LABEL.pavilion, icon: Tent },
  { value: "concessions", label: SPACE_KIND_LABEL.concessions, icon: UtensilsCrossed },
  { value: "lobby", label: SPACE_KIND_LABEL.lobby, icon: Sofa },
  { value: "bathroom", label: SPACE_KIND_LABEL.bathroom, icon: Toilet },
  { value: "parking_lot", label: SPACE_KIND_LABEL.parking_lot, icon: SquareParking },
  { value: "storage", label: SPACE_KIND_LABEL.storage, icon: Package },
  { value: "custom", label: SPACE_KIND_LABEL.custom, icon: Shapes }
];
