import type { Permission } from "@/src/features/core/access";

export type AiMode = "ask" | "act";
export type AiPhase = "plan" | "confirm" | "cancel";
export type AiConversationRole = "user" | "assistant";
export type AiSurface = "command" | "inline" | "sidebar";

export type AiConversationMessage = {
  role: AiConversationRole;
  content: string;
};

export type AiRequestPayload = {
  orgSlug?: string;
  userMessage: string;
  mode: AiMode;
  conversation: AiConversationMessage[];
  phase?: AiPhase;
  threadId?: string;
  turnId?: string;
  surface?: AiSurface;
  proposalId?: string;
  entitySelections?: Record<string, string>;
  uiContext?: AiUiContext;
};

export type AiUiContext = {
  source: "command_bar" | "workspace";
  requestedAt: string;
  route: {
    pathname: string;
    search?: string;
    hash?: string;
    title?: string;
    referrerPath?: string;
    queryParams?: Record<string, string>;
  };
  page: {
    currentModule?: "calendar" | "facilities" | "programs" | "teams" | "communications" | "files" | "settings" | "profiles" | "workspace" | "unknown";
    tool?: string;
    entityType?: string;
    entityId?: string;
    orgSlugFromPath?: string;
  };
  selection?: {
    text?: string;
    activeElement?: {
      tagName: string;
      role?: string;
      id?: string;
      name?: string;
      ariaLabel?: string;
      placeholder?: string;
      datasetContext?: string;
    };
  };
  viewport?: {
    width: number;
    height: number;
    isMobile: boolean;
  };
  runtime?: {
    timezone?: string;
    language?: string;
    online?: boolean;
    visibilityState?: string;
  };
  workspaceContext?: {
    view?: "overview" | "data_table" | "calendar" | "import_review" | "visualization" | "action_result";
    entityType?: string;
    entityIds?: string[];
    filters?: Record<string, string>;
    importRunId?: string;
  };
};

export type AiEntityCandidateType = "governing_body" | "program" | "program_node" | "player" | "form" | "form_submission" | "event";

export type AiEntityCandidate = {
  id: string;
  type: AiEntityCandidateType;
  label: string;
  subtitle: string | null;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export type AiEntityResolution = {
  type: AiEntityCandidateType;
  candidates: AiEntityCandidate[];
};

export type AiChangesetOperation = {
  kind: "insert" | "update";
  table: string;
  where: Record<string, string | null>;
  set: Record<string, string | null>;
  before?: Record<string, string | null>;
  after?: Record<string, string | null>;
};

export type AiChangesetPrecondition = {
  table: string;
  field: string;
  expected: string | null;
  reason: string;
};

export type AiChangesetV1 = {
  version: "v1";
  intentType: string;
  orgId: string;
  orgSlug: string;
  summary: string;
  preconditions: AiChangesetPrecondition[];
  operations: AiChangesetOperation[];
  revalidatePaths: string[];
};

export type AiProposalStep = {
  key: string;
  title: string;
  detail: string;
};

export type AiAmbiguityCandidate = {
  key: string;
  label: string;
  description: string | null;
};

export type AiAmbiguity = {
  key: string;
  title: string;
  description: string;
  candidates: AiAmbiguityCandidate[];
};

export type AiProposal = {
  intentType: string;
  executable: boolean;
  requiredPermissions: Permission[];
  summary: string;
  steps: AiProposalStep[];
  changeset: AiChangesetV1 | null;
  warnings: string[];
  ambiguity: AiAmbiguity | null;
};

export type AiToolCallEvent = {
  name: string;
  input: unknown;
};

export type AiToolResultEvent = {
  name: string;
  output: unknown;
};

export type AiExecutionResult = {
  ok: boolean;
  summary: string;
  warnings: string[];
  appliedChanges: number;
};

export type AiSseEventMap = {
  "assistant.delta": { text: string };
  "assistant.meta": {
    resultCards: AiResultCard[];
    suggestedActions: AiSuggestedAction[];
  };
  "assistant.done": { text: string; threadId?: string; turnId?: string };
  "tool.call": AiToolCallEvent;
  "tool.result": AiToolResultEvent;
  "proposal.ready": { proposalId: string | null; proposal: AiProposal };
  "execution.result": { proposalId: string; result: AiExecutionResult };
  error: { code: string; message: string; retryable?: boolean };
};

export type AiResultCard = {
  id: string;
  type: "player" | "account" | "event" | "schedule";
  title: string;
  subtitle?: string;
  fields?: Array<{ label: string; value: string }>;
  badges?: string[];
  href?: string;
  metadata?: Record<string, unknown>;
};

export type AiSuggestedAction = {
  id: string;
  label: string;
  actionType: string;
  payload: Record<string, unknown>;
};

export type AiSseEventName = keyof AiSseEventMap;

export type AiActAuditDetail = {
  prompt: string;
  mode: AiMode;
  phase: AiPhase;
  requestedAt: string;
  proposal: AiProposal | null;
  changeset: AiChangesetV1 | null;
  executed: boolean;
  canceled: boolean;
  canceledAt: string | null;
  executedAt: string | null;
  executionResult: AiExecutionResult | null;
  conversation: AiConversationMessage[];
};

export type AiPermissionEnvelope = {
  permissions: Permission[];
  canExecuteOrgActions: boolean;
  canReadOrg: boolean;
};

export type AiResolvedOrg = {
  orgId: string;
  orgSlug: string;
  orgName: string;
};

export type AiResolvedContext = {
  userId: string;
  email: string | null;
  userAccount: {
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    phone: string | null;
    avatarPath: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
    lastSignInAt: string | null;
    metadata: Record<string, unknown>;
  };
  org: AiResolvedOrg | null;
  account: {
    activePlayerId: string | null;
    players: Array<{
      id: string;
      label: string;
      subtitle: string | null;
    }>;
  };
  scope: {
    currentModule?: "calendar" | "facilities" | "programs" | "teams" | "communications" | "files" | "settings" | "profiles" | "workspace" | "unknown";
    entityId?: string;
    entityType?: string;
  };
  uiContext?: AiUiContext;
  permissionEnvelope: AiPermissionEnvelope;
};
