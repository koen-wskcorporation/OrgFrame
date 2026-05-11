import { CANVAS_GRID_SIZE } from "@/src/features/canvas/core/constants";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import type { ProgramNode } from "@/src/features/programs/types";

// Tree-layout geometry. Every value is a multiple of CANVAS_GRID_SIZE
// (24px) so node edges and gaps land on the canvas grid. Positions are
// snapped after centering so the resulting x/y also fall on grid lines.
export const TREE_PROGRAM_WIDTH = 384;
export const TREE_PROGRAM_HEIGHT = 48;
export const TREE_DIVISION_WIDTH = 336;
/** Header strip of a division: name + status + assigned/unassigned counts. */
export const TREE_DIVISION_HEADER_HEIGHT = 72;
/** Height of each nested team row inside a division. */
export const TREE_TEAM_ROW_HEIGHT = 48;
export const TREE_H_GAP = 48;
export const TREE_V_GAP = 48;

/** Snap a value to the nearest grid line. Used after centering math so
 *  positions land on the grid even when (treeWidth - childWidth)/2 is
 *  not a multiple of the grid size. */
function snapToGrid(value: number): number {
  return Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
}

// Reserved ID for the virtual "program root" node — it isn't persisted in
// the divisions table, it's purely a visual hub.
export const PROGRAM_ROOT_ID = "__program_root__";

export type TreeEdge = {
  from: string;
  to: string;
};

export type TreeLayoutResult = {
  programBounds: CanvasBounds;
  nodeBounds: Map<string, CanvasBounds>;
  edges: TreeEdge[];
  /** Outer extent of everything in the tree. Used by fit-to-content. */
  contentBounds: CanvasBounds;
};

function sortBySortIndex<T extends { sortIndex: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
}

/**
 * Total division height when nesting `teamCount` teams plus one trailing
 * "Add team" slot at the bottom. The slot is baked into geometry so the
 * layout is identical for read-only viewers.
 */
export function divisionHeightFor(teamCount: number): number {
  return TREE_DIVISION_HEADER_HEIGHT + (teamCount + 1) * TREE_TEAM_ROW_HEIGHT;
}

/** Position of the i-th nested team inside `divisionBounds`. */
export function nestedTeamBounds(divisionBounds: CanvasBounds, indexInParent: number): CanvasBounds {
  return {
    x: divisionBounds.x,
    y: divisionBounds.y + TREE_DIVISION_HEADER_HEIGHT + indexInParent * TREE_TEAM_ROW_HEIGHT,
    width: divisionBounds.width,
    height: TREE_TEAM_ROW_HEIGHT
  };
}

/**
 * Compute a top-down tree layout:
 *   Program (centered, level 0)
 *     ↓
 *   Division … Division (level 1, in a single row)
 *      \_team
 *       \_team    (teams render INSIDE their division card)
 *
 * Connector lines run from the program node down to each division. Teams
 * don't get their own edges — they sit nested as rows inside the parent
 * division, which grows tall enough to hold them.
 */
export function computeTreeLayout(nodes: ProgramNode[]): TreeLayoutResult {
  const teamsByParent = new Map<string, ProgramNode[]>();
  for (const node of nodes) {
    if (node.nodeKind === "team" && node.parentId) {
      const list = teamsByParent.get(node.parentId) ?? [];
      list.push(node);
      teamsByParent.set(node.parentId, list);
    }
  }

  const divisions = sortBySortIndex(
    nodes.filter((node) => node.nodeKind === "division" && !node.parentId)
  );

  // Row width = sum of division widths + gaps.
  const rowWidth = divisions.length > 0
    ? divisions.length * TREE_DIVISION_WIDTH + Math.max(0, divisions.length - 1) * TREE_H_GAP
    : TREE_PROGRAM_WIDTH;

  const PADDING = 48;
  const originX = PADDING;
  const originY = PADDING;

  // Whichever is wider (program node or division row) anchors the layout
  // width. Both are centered against that anchor so the tree reads as
  // symmetrical regardless of which has more content. Centering offsets
  // are snapped to the grid so card edges always land on grid lines —
  // when the centered offset isn't a multiple of 24, we pick the nearest
  // grid line instead of leaving a half-cell crack.
  const treeWidth = Math.max(TREE_PROGRAM_WIDTH, rowWidth);
  const programX = originX + snapToGrid((treeWidth - TREE_PROGRAM_WIDTH) / 2);
  const rowStartX = originX + snapToGrid((treeWidth - rowWidth) / 2);
  const programY = originY;
  const programBounds: CanvasBounds = {
    x: programX,
    y: programY,
    width: TREE_PROGRAM_WIDTH,
    height: TREE_PROGRAM_HEIGHT
  };

  const nodeBounds = new Map<string, CanvasBounds>();
  const edges: TreeEdge[] = [];

  let cursorX = rowStartX;
  const divisionRowY = programY + TREE_PROGRAM_HEIGHT + TREE_V_GAP;

  for (const division of divisions) {
    const teams = sortBySortIndex(teamsByParent.get(division.id) ?? []);
    const divisionHeight = divisionHeightFor(teams.length);

    const divisionBounds: CanvasBounds = {
      x: cursorX,
      y: divisionRowY,
      width: TREE_DIVISION_WIDTH,
      height: divisionHeight
    };
    nodeBounds.set(division.id, divisionBounds);
    edges.push({ from: PROGRAM_ROOT_ID, to: division.id });

    // Place each nested team row inside the division.
    teams.forEach((team, index) => {
      nodeBounds.set(team.id, nestedTeamBounds(divisionBounds, index));
    });

    cursorX += TREE_DIVISION_WIDTH + TREE_H_GAP;
  }

  // Orphan teams (no recognised parent) — drop them in a fallback row
  // below the division row so the user can find and re-parent them.
  const orphanTeams = nodes.filter(
    (node) => node.nodeKind === "team" && (!node.parentId || !nodes.some((n) => n.id === node.parentId))
  );
  if (orphanTeams.length > 0) {
    // Position below the tallest division.
    const deepestDivisionBottom = Array.from(nodeBounds.values()).reduce(
      (acc, bounds) => Math.max(acc, bounds.y + bounds.height),
      divisionRowY
    );
    const orphanY = deepestDivisionBottom + TREE_V_GAP;
    let orphanX = originX;
    for (const team of sortBySortIndex(orphanTeams)) {
      nodeBounds.set(team.id, {
        x: orphanX,
        y: orphanY,
        width: TREE_DIVISION_WIDTH,
        height: TREE_TEAM_ROW_HEIGHT
      });
      orphanX += TREE_DIVISION_WIDTH + TREE_H_GAP;
    }
  }

  // Content extent for fit-to-content.
  let minX = programBounds.x;
  let minY = programBounds.y;
  let maxX = programBounds.x + programBounds.width;
  let maxY = programBounds.y + programBounds.height;
  for (const bounds of nodeBounds.values()) {
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  return {
    programBounds,
    nodeBounds,
    edges,
    contentBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  };
}
