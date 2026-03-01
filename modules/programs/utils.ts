import type { ProgramNode } from "@/modules/programs/types";

export function isProgramNodePublished(node: Pick<ProgramNode, "settingsJson">): boolean {
  return node.settingsJson.published !== false;
}
