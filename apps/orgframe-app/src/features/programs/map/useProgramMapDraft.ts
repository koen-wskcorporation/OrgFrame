"use client";

import * as React from "react";
import { normalizeBounds } from "@/src/features/canvas/core/geometry";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import type { ProgramNode } from "@/src/features/programs/types";
import { computeAutoLayout } from "@/src/features/programs/map/autoLayout";
import type {
  ProgramMapDraftSnapshot,
  ProgramMapNode,
  ProgramMapSavePayload
} from "@/src/features/programs/map/types";

function buildDraftFromNodes(nodes: ProgramNode[]): ProgramMapDraftSnapshot {
  const fallback = computeAutoLayout(nodes);
  const draftNodes: ProgramMapNode[] = nodes.map((node) => {
    const stored = node.mapBounds;
    const placedByFallback = !stored;
    const bounds: CanvasBounds = stored
      ? normalizeBounds(stored)
      : normalizeBounds(
          fallback.get(node.id) ?? { x: 24, y: 24, width: 192, height: 72 }
        );

    return {
      id: node.id,
      programId: node.programId,
      parentId: node.parentId,
      name: node.name,
      slug: node.slug,
      nodeKind: node.nodeKind,
      bounds,
      zIndex: node.mapZIndex ?? 0,
      capacity: node.capacity,
      placedByFallback
    };
  });

  return { nodes: draftNodes };
}

function diffSavePayload(
  draft: ProgramMapDraftSnapshot,
  baseline: ProgramMapDraftSnapshot
): ProgramMapSavePayload {
  const baselineById = new Map(baseline.nodes.map((node) => [node.id, node]));
  const updates: ProgramMapSavePayload["updates"] = [];

  for (const node of draft.nodes) {
    const base = baselineById.get(node.id);
    const dirty =
      !base ||
      base.placedByFallback !== node.placedByFallback ||
      base.bounds.x !== node.bounds.x ||
      base.bounds.y !== node.bounds.y ||
      base.bounds.width !== node.bounds.width ||
      base.bounds.height !== node.bounds.height ||
      base.zIndex !== node.zIndex;

    if (!dirty) continue;

    updates.push({
      nodeId: node.id,
      mapX: node.bounds.x,
      mapY: node.bounds.y,
      mapWidth: node.bounds.width,
      mapHeight: node.bounds.height,
      mapZIndex: node.zIndex
    });
  }

  return { updates };
}

export type UseProgramMapDraftResult = {
  nodes: ProgramMapNode[];
  isDirty: boolean;
  setBounds: (nodeId: string, bounds: CanvasBounds) => void;
  reparent: (nodeId: string, nextParentId: string | null) => void;
  bringToFront: (nodeId: string) => void;
  buildSavePayload: () => ProgramMapSavePayload;
  commit: (nodes: ProgramNode[]) => void;
  discard: () => void;
};

export function useProgramMapDraft(initialNodes: ProgramNode[]): UseProgramMapDraftResult {
  const [draft, setDraft] = React.useState<ProgramMapDraftSnapshot>(() =>
    buildDraftFromNodes(initialNodes)
  );
  const [baseline, setBaseline] = React.useState<ProgramMapDraftSnapshot>(() =>
    buildDraftFromNodes(initialNodes)
  );
  const initialNodesRef = React.useRef(initialNodes);

  // When the parent re-fetches and hands us a new node list, refresh both
  // draft and baseline. We compare by identity to avoid clobbering local edits
  // on every render.
  React.useEffect(() => {
    if (initialNodesRef.current === initialNodes) return;
    initialNodesRef.current = initialNodes;
    const next = buildDraftFromNodes(initialNodes);
    setDraft(next);
    setBaseline(next);
  }, [initialNodes]);

  const setBounds = React.useCallback((nodeId: string, bounds: CanvasBounds) => {
    setDraft((prev) => ({
      nodes: prev.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, bounds: normalizeBounds(bounds), placedByFallback: false }
          : node
      )
    }));
  }, []);

  const reparent = React.useCallback((nodeId: string, nextParentId: string | null) => {
    setDraft((prev) => ({
      nodes: prev.nodes.map((node) =>
        node.id === nodeId ? { ...node, parentId: nextParentId } : node
      )
    }));
  }, []);

  const bringToFront = React.useCallback((nodeId: string) => {
    setDraft((prev) => {
      const maxZ = prev.nodes.reduce((acc, node) => Math.max(acc, node.zIndex), 0);
      return {
        nodes: prev.nodes.map((node) =>
          node.id === nodeId ? { ...node, zIndex: maxZ + 1 } : node
        )
      };
    });
  }, []);

  const buildSavePayload = React.useCallback(() => diffSavePayload(draft, baseline), [draft, baseline]);

  const commit = React.useCallback((nodes: ProgramNode[]) => {
    const next = buildDraftFromNodes(nodes);
    setDraft(next);
    setBaseline(next);
  }, []);

  const discard = React.useCallback(() => {
    setDraft(baseline);
  }, [baseline]);

  // Auto-placed (fallback) nodes count as dirty: we want their first-paint
  // positions persisted on the next save so users don't see the canvas
  // shuffle on reload.
  const isDirty = React.useMemo(() => {
    return diffSavePayload(draft, baseline).updates.length > 0
      || draft.nodes.some((node) => node.placedByFallback);
  }, [draft, baseline]);

  return {
    nodes: draft.nodes,
    isDirty,
    setBounds,
    reparent,
    bringToFront,
    buildSavePayload,
    commit,
    discard
  };
}
