import type { VisualTokenMap } from "@/modules/visual/types";

export function mergeVisualTokens(...tokenMaps: Array<VisualTokenMap | null | undefined>): VisualTokenMap {
  return tokenMaps.reduce<VisualTokenMap>((accumulator, tokenMap) => {
    if (!tokenMap) {
      return accumulator;
    }
    return { ...accumulator, ...tokenMap };
  }, {});
}
