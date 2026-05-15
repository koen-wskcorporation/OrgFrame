import type { ShareTarget, ShareTargetType } from "@/src/features/org-share/types";

export type ShareTargetDisplay = {
  /** The entity's own name. Always present. */
  primary: string;
  /** Parent path joined with " / " (e.g. "Spring League / 12U North"). Null when there is no parent. */
  context: string | null;
  /** Parent path with the immediate parent first (e.g. "12U North / Spring League"). Null when there is no parent. */
  reversedContext: string | null;
  /** Full disambiguated path including the entity itself, root first (used for tooltips, aria-labels, search haystacks). */
  fullPath: string;
  /** Full path with the entity itself first, then ancestors leaf-to-root (e.g. "Team Smith / 12U North / Spring League"). */
  reversedFullPath: string;
};

const SEPARATOR = " / ";

function targetKey(target: Pick<ShareTarget, "type" | "id">) {
  return `${target.type}:${target.id}`;
}

/**
 * Compute display metadata for every share target in a catalog. Walks the
 * `parentId` graph for teams and divisions and produces a stable path that
 * disambiguates same-named entities (two "12U" divisions under different
 * programs, two "Team Smith" teams under different divisions, etc.).
 *
 * Returned as a Map keyed by `${type}:${id}` so the caller can look up the
 * display for an individual target without re-walking the graph.
 *
 * Always emits the full path so disambiguation is consistent regardless of
 * whether any other catalog row happens to collide on name.
 */
export function buildShareTargetDisplays(targets: ReadonlyArray<ShareTarget>): Map<string, ShareTargetDisplay> {
  const byKey = new Map<string, ShareTarget>();
  for (const target of targets) {
    byKey.set(targetKey(target), target);
  }

  const cache = new Map<string, string[]>();

  function resolveAncestry(target: ShareTarget, seen: Set<string>): string[] {
    const key = targetKey(target);
    const cached = cache.get(key);
    if (cached) return cached;
    if (seen.has(key)) return [];
    seen.add(key);

    if (!target.parentId || !target.parentType) {
      const result = [target.label];
      cache.set(key, result);
      return result;
    }

    const parentKey = targetKey({ type: target.parentType, id: target.parentId } as ShareTarget);
    const parent = byKey.get(parentKey);
    if (!parent) {
      const result = [target.label];
      cache.set(key, result);
      return result;
    }

    const result = [...resolveAncestry(parent, seen), target.label];
    cache.set(key, result);
    return result;
  }

  const out = new Map<string, ShareTargetDisplay>();
  for (const target of targets) {
    const ancestry = resolveAncestry(target, new Set());
    const primary = target.label;
    const context = ancestry.length > 1 ? ancestry.slice(0, -1).join(SEPARATOR) : null;
    const reversedContext = ancestry.length > 1 ? [...ancestry].slice(0, -1).reverse().join(SEPARATOR) : null;
    const fullPath = ancestry.join(SEPARATOR);
    const reversedFullPath = [...ancestry].reverse().join(SEPARATOR);
    out.set(targetKey(target), { primary, context, reversedContext, fullPath, reversedFullPath });
  }

  return out;
}

/**
 * Helper for the common case: format a single target's display directly
 * (e.g. for a stored chip whose parent context isn't in the same catalog
 * snapshot). Falls back to `target.label` alone when ancestry is missing.
 */
export function displayForShareTarget(
  target: Pick<ShareTarget, "id" | "type" | "label" | "subtitle">,
  displays: Map<string, ShareTargetDisplay> | null
): ShareTargetDisplay {
  if (displays) {
    const found = displays.get(targetKey(target));
    if (found) return found;
  }
  const subtitle = target.subtitle ?? null;
  return {
    primary: target.label,
    context: subtitle,
    reversedContext: subtitle,
    fullPath: subtitle ? `${subtitle}${SEPARATOR}${target.label}` : target.label,
    reversedFullPath: subtitle ? `${target.label}${SEPARATOR}${subtitle}` : target.label
  };
}

/** Exposed so callers can filter the catalog by hierarchical types without re-listing the union. */
export const HIERARCHICAL_SHARE_TYPES = new Set<ShareTargetType>(["program", "division", "team"]);
