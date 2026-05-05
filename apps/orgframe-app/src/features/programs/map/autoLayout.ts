import {
  CANVAS_GRID_SIZE,
  CANVAS_PADDING,
  CANVAS_WIDTH
} from "@/src/features/canvas/core/constants";
import { snapToGrid } from "@/src/features/canvas/core/geometry";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import type { ProgramNode } from "@/src/features/programs/types";

// Division layout — teams render *inside* the division card. Height is
// computed from the team count so the parent visually contains its children.
// All dimensions are exact multiples of CANVAS_GRID_SIZE (24) so that every
// node corner lands on a grid line — keeps the background grid from looking
// like it's sliding under the cards as the user pans/zooms.
export const DIVISION_WIDTH = 240; // 10 × 24
export const DIVISION_HEADER_HEIGHT = 48; // 2 × 24
export const DIVISION_BODY_PAD = 0;

// Team layout — teams render flush inside the division (no inner padding).
// Their own border overlaps the division's border (same color, same width)
// so visually it remains a single edge.
export const TEAM_HEIGHT = 48; // 2 × 24
export const TEAM_GAP = 0;
export const TEAM_WIDTH = DIVISION_WIDTH;

// Spacing between sibling division columns / between rows when wrapping.
const COLUMN_GAP = 24; // 1 × 24
const ROW_GAP = 24; // 1 × 24

function snapBounds(bounds: CanvasBounds): CanvasBounds {
  return {
    x: snapToGrid(bounds.x),
    y: snapToGrid(bounds.y),
    width: snapToGrid(bounds.width),
    height: snapToGrid(bounds.height)
  };
}

/**
 * Total division height for a given number of nested teams. The height
 * always reserves one extra slot below the last team for an "Add team"
 * affordance — the editor draws a dashed click-to-add row there. We bake
 * the slot into geometry (instead of conditionally on canWrite) so the
 * persisted layout is identical for every viewer.
 */
export function divisionHeightFor(teamCount: number): number {
  return DIVISION_HEADER_HEIGHT + (teamCount + 1) * TEAM_HEIGHT;
}

/** Position of the i-th nested team inside a division placed at `divisionBounds`. */
export function nestedTeamBounds(divisionBounds: CanvasBounds, indexInParent: number): CanvasBounds {
  return {
    x: divisionBounds.x,
    y: divisionBounds.y + DIVISION_HEADER_HEIGHT + indexInParent * TEAM_HEIGHT,
    width: TEAM_WIDTH,
    height: TEAM_HEIGHT
  };
}

/**
 * Compute a deterministic grid layout for any nodes that don't have stored
 * map geometry yet. Teams are nested inside their parent division — the
 * division grows tall to fit them. Divisions wrap to the next row when the
 * canvas width is exceeded.
 */
export function computeAutoLayout(nodes: ProgramNode[]): Map<string, CanvasBounds> {
  const result = new Map<string, CanvasBounds>();

  const divisions = nodes.filter((node) => node.nodeKind === "division" && !node.parentId);
  const teamsByParent = new Map<string, ProgramNode[]>();
  for (const node of nodes) {
    if (node.nodeKind === "team" && node.parentId) {
      const list = teamsByParent.get(node.parentId) ?? [];
      list.push(node);
      teamsByParent.set(node.parentId, list);
    }
  }

  divisions.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));

  let cursorX = CANVAS_PADDING;
  let cursorY = CANVAS_PADDING;
  let rowMaxHeight = 0;

  for (const division of divisions) {
    const teams = (teamsByParent.get(division.id) ?? []).sort(
      (a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name)
    );

    const height = divisionHeightFor(teams.length);

    if (cursorX + DIVISION_WIDTH > CANVAS_WIDTH - CANVAS_PADDING) {
      cursorX = CANVAS_PADDING;
      cursorY += rowMaxHeight + ROW_GAP;
      rowMaxHeight = 0;
    }

    const divisionBounds = snapBounds({
      x: cursorX,
      y: cursorY,
      width: DIVISION_WIDTH,
      height
    });
    result.set(division.id, divisionBounds);

    teams.forEach((team, index) => {
      result.set(team.id, snapBounds(nestedTeamBounds(divisionBounds, index)));
    });

    cursorX += DIVISION_WIDTH + COLUMN_GAP;
    rowMaxHeight = Math.max(rowMaxHeight, height);
  }

  // Orphan teams (no division parent or unknown parent) get a fallback row at
  // the bottom — visible but visually unattached, prompting a re-parent.
  const orphanTeams = nodes.filter(
    (node) => node.nodeKind === "team" && (!node.parentId || !nodes.some((n) => n.id === node.parentId))
  );
  if (orphanTeams.length > 0) {
    let orphanX = CANVAS_PADDING;
    const orphanY = cursorY + rowMaxHeight + ROW_GAP;
    for (const team of orphanTeams) {
      if (result.has(team.id)) continue;
      result.set(
        team.id,
        snapBounds({ x: orphanX, y: orphanY, width: TEAM_WIDTH, height: TEAM_HEIGHT })
      );
      orphanX += TEAM_WIDTH + Math.max(CANVAS_GRID_SIZE, 16);
    }
  }

  return result;
}

export const PROGRAM_MAP_DEFAULT_DIVISION_SIZE = {
  width: DIVISION_WIDTH,
  height: divisionHeightFor(0)
} as const;

export const PROGRAM_MAP_DEFAULT_TEAM_SIZE = {
  width: TEAM_WIDTH,
  height: TEAM_HEIGHT
} as const;
