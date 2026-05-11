/**
 * Pure slug helpers shared by the program-map wizards. Mirrors the
 * normalization the Input primitive uses for slug validation so client-
 * side `validate()` calls in CreateWizard steps agree with what the
 * Input renders below the field.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugStatus = "idle" | "available" | "taken" | "invalid";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueSlug(base: string, taken: Set<string>, fallback = "item"): string {
  const root = slugify(base) || fallback;
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function computeSlugStatus(slug: string, existingSlugs: Set<string>): SlugStatus {
  if (!slug) return "idle";
  if (slug.length < 2 || slug.length > 80 || !SLUG_PATTERN.test(slug)) return "invalid";
  if (existingSlugs.has(slug)) return "taken";
  return "available";
}
