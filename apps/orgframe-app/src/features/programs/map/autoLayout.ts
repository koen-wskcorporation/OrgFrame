import {
  CANVAS_GRID_SIZE,
  CANVAS_PADDING,
  CANVAS_WIDTH
} from "@/src/features/canvas/core/constants";
import { snapToGrid } from "@/src/features/canvas/core/geometry";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import type { ProgramNode } from "@/src/features/programs/types";

const DIVISION_WIDTH = 240;
const DIVISION_HEIGHT = 96;
const TEAM_WIDTH = 192;
const TEAM_HEIGHT = 72;
const COLUMN_GAP = 48;
const ROW_GAP = 24;
const TEAMS_PER_ROW = 2;

function snapBounds(bounds: CanvasBounds): CanvasBounds {
  return {
    x: snapToGrid(bounds.x),
    y: snapToGrid(bounds.y),
    width: snapToGrid(bounds.width),
    height: snapToGrid(bounds.height)
  };
}

/**
 * Compute a deterministic grid layout for any nodes that don't have stored
 * map geometry yet. Divisions become column headers; their teams stack
 * underneath in two columns. Existing geometry is left alone — only nulls
 * get filled in. Result columns wrap when they would exceed canvas width.
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

    const teamRows = Math.max(1, Math.ceil(teams.length / TEAMS_PER_ROW));
    const columnWidth = Math.max(
      DIVISION_WIDTH,
      TEAMS_PER_ROW * TEAM_WIDTH + (TEAMS_PER_ROW - 1) * Math.max(CANVAS_GRID_SIZE, 24)
    );
    const columnHeight =
      DIVISION_HEIGHT + ROW_GAP * 2 + teamRows * TEAM_HEIGHT + (teamRows - 1) * ROW_GAP;

    if (cursorX + columnWidth > CANVAS_WIDTH - CANVAS_PADDING) {
      cursorX = CANVAS_PADDING;
      cursorY += rowMaxHeight + ROW_GAP * 2;
      rowMaxHeight = 0;
    }

    const divisionBounds = snapBounds({
      x: cursorX + (columnWidth - DIVISION_WIDTH) / 2,
      y: cursorY,
      width: DIVISION_WIDTH,
      height: DIVISION_HEIGHT
    });
    result.set(division.id, divisionBounds);

    let teamY = cursorY + DIVISION_HEIGHT + ROW_GAP * 2;
    teams.forEach((team, index) => {
      const col = index % TEAMS_PER_ROW;
      const row = Math.floor(index / TEAMS_PER_ROW);
      const teamX = cursorX + col * (TEAM_WIDTH + Math.max(CANVAS_GRID_SIZE, 24));
      const teamBounds = snapBounds({
        x: teamX,
        y: teamY + row * (TEAM_HEIGHT + ROW_GAP),
        width: TEAM_WIDTH,
        height: TEAM_HEIGHT
      });
      result.set(team.id, teamBounds);
    });

    cursorX += columnWidth + COLUMN_GAP;
    rowMaxHeight = Math.max(rowMaxHeight, columnHeight);
  }

  // Orphan teams (no division parent or unknown parent) get appended in a row at the bottom.
  const orphanTeams = nodes.filter(
    (node) => node.nodeKind === "team" && (!node.parentId || !nodes.some((n) => n.id === node.parentId))
  );
  if (orphanTeams.length > 0) {
    let orphanX = CANVAS_PADDING;
    const orphanY = cursorY + rowMaxHeight + ROW_GAP * 2;
    for (const team of orphanTeams) {
      if (result.has(team.id)) continue;
      result.set(
        team.id,
        snapBounds({ x: orphanX, y: orphanY, width: TEAM_WIDTH, height: TEAM_HEIGHT })
      );
      orphanX += TEAM_WIDTH + ROW_GAP;
    }
  }

  return result;
}

export const PROGRAM_MAP_DEFAULT_DIVISION_SIZE = {
  width: DIVISION_WIDTH,
  height: DIVISION_HEIGHT
} as const;

export const PROGRAM_MAP_DEFAULT_TEAM_SIZE = {
  width: TEAM_WIDTH,
  height: TEAM_HEIGHT
} as const;
