import type { ProgramNode } from "@/src/features/programs/types";

export function isProgramNodePublished(node: Pick<ProgramNode, "settingsJson">): boolean {
  return node.settingsJson.published !== false;
}
