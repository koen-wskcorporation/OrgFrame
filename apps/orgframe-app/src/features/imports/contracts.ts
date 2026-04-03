export const importProfiles = ["people_roster", "program_structure", "commerce_orders"] as const;

export type ImportProfileKey = (typeof importProfiles)[number];

export type ImportRunStatus =
  | "queued"
  | "processing"
  | "awaiting_conflicts"
  | "resolving_conflicts"
  | "ready_to_apply"
  | "applying"
  | "completed"
  | "failed"
  | "cancelled"
  | "undoing"
  | "undone";

export type ImportConflictState = "pending_ai" | "needs_review" | "auto_applied" | "manual_resolved" | "dismissed";

export type NormalizedRow = {
  profile: ImportProfileKey;
  canonical: Record<string, unknown>;
  matchKeys: Record<string, string | null>;
};

export type MatchCandidate = {
  id: string;
  score: number;
  reason: string;
  payload: Record<string, unknown>;
};

export type ConflictRecord = {
  id: string;
  runId: string;
  rowId: string;
  profile: ImportProfileKey;
  conflictType: string;
  importedPayload: Record<string, unknown>;
  candidateRecords: MatchCandidate[];
  aiSuggestion: AiResolution | null;
  resolutionState: ImportConflictState;
};

export type AiResolution = {
  action: "insert" | "update" | "skip";
  targetId: string | null;
  confidence: number;
  rationale: string;
  userPrompt: string;
};

export type ApplyResult = {
  rowId: string;
  action: "insert" | "update" | "skip";
  applied: boolean;
  targetRef: {
    schema: string;
    table: string;
    id: string | null;
  };
  message: string | null;
};

export type ImportRunListItem = {
  id: string;
  profile: ImportProfileKey;
  status: ImportRunStatus;
  progress: number;
  sourceFilename: string | null;
  rowCount: number;
  summary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorText: string | null;
};
