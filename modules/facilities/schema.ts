import { z } from "zod";

export const facilityTypeSchema = z.enum(["park", "complex", "building", "campus", "field_cluster", "gym", "indoor", "custom"]);

export const facilityNodeKindSchema = z.enum([
  "facility",
  "zone",
  "building",
  "section",
  "field",
  "court",
  "diamond",
  "rink",
  "room",
  "amenity",
  "parking",
  "support_area",
  "custom"
]);

export const facilityStatusSchema = z.enum(["open", "closed", "archived"]);

export const facilityNodeLayoutSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().min(40),
  h: z.number().int().min(40),
  z: z.number().int().min(0),
  shape: z.enum(["rect", "pill"]),
  containerMode: z.enum(["free", "stack"])
});
