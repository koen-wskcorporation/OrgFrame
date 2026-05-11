/**
 * Predefined "dynamic" pages.
 *
 * In this app, a dynamic page is just a regular content page at a reserved
 * slug whose first (locked) block is one of the data-driven block types — the
 * Programs catalog, Events list, Teams directory, etc. The page itself can
 * still be edited freely; only the seed block is protected from deletion so
 * the page never loses the dynamic listing it was created for.
 *
 * The reserved slug protects the URL from being claimed by a freshly created
 * static page later, even before the dynamic page exists.
 *
 * Used by:
 *   - The website-manager wizard (offers the user this list when they pick
 *     the "Dynamic" type).
 *   - `createWebsiteDynamicPageAction` (creates the page and seeds the
 *     locked block).
 */

import type { OrgSiteBlockType } from "./types";

export type DynamicPagePreset = {
  /** Stable identifier sent from the wizard to the action. */
  key: string;
  /** Default page title — user can rename later. */
  title: string;
  /** Reserved slug. Must be present in `reservedPageSlugs`. */
  slug: string;
  /** One-line copy shown in the picker. */
  description: string;
  /** Block type seeded as the page's first (locked) block. */
  blockType: OrgSiteBlockType;
};

export const DYNAMIC_PAGE_PRESETS: readonly DynamicPagePreset[] = [
  {
    key: "programs",
    title: "Programs",
    slug: "programs",
    description: "Auto-listing of every program your org offers.",
    blockType: "program_catalog"
  },
  {
    key: "events",
    title: "Events",
    slug: "events",
    description: "Auto-listing of upcoming events.",
    blockType: "events"
  },
  {
    key: "teams",
    title: "Teams",
    slug: "teams",
    description: "Directory of every team in your org.",
    blockType: "teams_directory"
  },
  {
    key: "facilities",
    title: "Facilities",
    slug: "facilities",
    description: "Directory of every facility space.",
    blockType: "facility_space_list"
  }
] as const;

export function findDynamicPagePreset(key: string): DynamicPagePreset | null {
  return DYNAMIC_PAGE_PRESETS.find((p) => p.key === key) ?? null;
}
