import { getAiConfig } from "@/src/features/ai/config";
import type { AiConversationMessage, AiMode, AiProposal, AiResolvedContext } from "@/src/features/ai/types";
import { aiToolDefinitions, runAiTool } from "@/src/features/ai/tools";

type PlanningToolName = "resolve_entities" | "propose_changes";

type GatewayTelemetry = {
  phase: "ask" | "act";
  model: string;
  attempt: number;
  latencyMs: number;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  hadToolCalls: boolean;
};

type GatewayResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export type AiPlanningCallbacks = {
  onAssistantDelta: (text: string) => void;
  onToolCall: (name: string, input: unknown) => void;
  onToolResult: (name: string, output: unknown) => void;
};

export type AiPlanningResult = {
  assistantText: string;
  proposal: AiProposal | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let inFlightGatewayRequests = 0;
const waitingGatewayResolvers: Array<() => void> = [];

async function withGatewayQueueSlot<T>(task: () => Promise<T>): Promise<T> {
  const config = getAiConfig();

  if (inFlightGatewayRequests >= config.maxConcurrentRequests) {
    await new Promise<void>((resolve) => {
      waitingGatewayResolvers.push(resolve);
    });
  }

  inFlightGatewayRequests += 1;

  try {
    return await task();
  } finally {
    inFlightGatewayRequests -= 1;
    const next = waitingGatewayResolvers.shift();
    if (next) {
      next();
    }
  }
}

function getGatewayConnection() {
  const config = getAiConfig();

  return {
    model: config.model,
    fallbackModels: config.fallbackModels,
    maxOutputTokens: config.maxOutputTokens,
    retryAttempts: config.retryAttempts,
    retryBaseDelayMs: config.retryBaseDelayMs,
    requestTimeoutMs: config.requestTimeoutMs,
    gatewayApiKey: config.gatewayApiKey,
    gatewayBaseUrl: config.gatewayBaseUrl
  };
}

function buildSystemInstructions(input: {
  mode: AiMode;
  canExecute: boolean;
  orgSlug: string | null;
  scopeModule: AiResolvedContext["scope"]["currentModule"];
  activePlayerId: string | null;
  playerSummaries: string[];
}) {
  const orgInstruction = input.orgSlug
    ? `Current org context is \`${input.orgSlug}\`. Keep any org action scoped to this org.`
    : "No org context is available. Keep responses account-scoped and never propose executable org mutations.";
  const scopeInstruction = input.scopeModule ? `Current page module is \`${input.scopeModule}\`.` : "Current page module is unknown.";
  const playerInstruction =
    input.playerSummaries.length > 0
      ? `Players on this account: ${input.playerSummaries.join("; ")}.`
      : "No players are currently linked to this account.";
  const activePlayerInstruction = input.activePlayerId ? `Active player id in context: \`${input.activePlayerId}\`.` : "No active player is selected.";

  return [
    "You are OrgFrame AI Assistant for all authenticated users.",
    "Never mutate data directly from this planning interaction.",
    "For action requests: first resolve entities, then propose a structured dry-run plan.",
    "Only use provided tools for grounded actions and avoid hallucinated entities.",
    "If the request is ambiguous, ask for specific selection and provide candidates.",
    orgInstruction,
    scopeInstruction,
    playerInstruction,
    activePlayerInstruction,
    input.mode === "ask" || !input.canExecute
      ? "This is ask mode or insufficient-permission context. You may answer questions, but do not propose executable changesets."
      : "This is act planning mode. You must return a confirmable proposal and changeset before execution.",
    "Keep responses concise and operational."
  ].join("\n");
}

function toGatewayMessages(input: { conversation: AiConversationMessage[]; userMessage: string }) {
  const conversationItems = input.conversation.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant" as const,
        content: [{ type: "output_text" as const, text: message.content }]
      };
    }

    return {
      role: "user" as const,
      content: [{ type: "input_text" as const, text: message.content }]
    };
  });

  return [...conversationItems, { role: "user", content: [{ type: "input_text", text: input.userMessage }] }];
}

function extractResponseText(response: GatewayResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const texts: string[] = [];

  for (const item of output) {
    if (item?.type !== "message") {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];

    for (const entry of content) {
      if (entry?.type === "output_text" && typeof entry.text === "string") {
        texts.push(entry.text);
      }
    }
  }

  return texts.join("\n").trim();
}

function extractFunctionCalls(response: GatewayResponse): Array<{ name: PlanningToolName; callId: string; argumentsJson: string }> {
  const output = Array.isArray(response.output) ? response.output : [];

  return output
    .filter((item) => item?.type === "function_call" && typeof item?.name === "string" && typeof item?.call_id === "string")
    .map((item) => ({
      name: item.name as PlanningToolName,
      callId: item.call_id as string,
      argumentsJson: typeof item.arguments === "string" ? item.arguments : "{}"
    }));
}

function extractUsage(response: GatewayResponse) {
  const usage = response.usage;
  const inputTokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : null;
  const outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : null;
  const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

  return { inputTokens, outputTokens, totalTokens };
}

function emitGatewayTelemetry(payload: GatewayTelemetry) {
  console.info(
    "[ai.gateway]",
    JSON.stringify({
      phase: payload.phase,
      model: payload.model,
      attempt: payload.attempt,
      latencyMs: payload.latencyMs,
      requestId: payload.requestId,
      inputTokens: payload.inputTokens,
      outputTokens: payload.outputTokens,
      totalTokens: payload.totalTokens,
      hadToolCalls: payload.hadToolCalls
    })
  );
}

function isRetryableError(error: unknown): boolean {
  const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status: number }).status) : null;

  if (status && (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500)) {
    return true;
  }

  const code = typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code).toLowerCase() : "";

  return ["etimedout", "econnreset", "eai_again", "enotfound", "service_unavailable"].some((candidate) => code.includes(candidate));
}

function emitTextInChunks(text: string, onDelta: (text: string) => void) {
  const chunkSize = 120;

  for (let index = 0; index < text.length; index += chunkSize) {
    onDelta(text.slice(index, index + chunkSize));
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function postGatewayResponse(input: {
  model: string;
  request: Record<string, unknown>;
  timeoutMs: number;
  gatewayBaseUrl: string;
  gatewayApiKey: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(`${input.gatewayBaseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.gatewayApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...input.request,
        model: input.model
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;

    if (!response.ok) {
      const message =
        typeof (parsed as { error?: { message?: unknown } })?.error?.message === "string"
          ? String((parsed as { error: { message: string } }).error.message)
          : `Gateway request failed with status ${response.status}.`;
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return parsed as GatewayResponse;
  } finally {
    clearTimeout(timeout);
  }
}

async function createGatewayResponseWithRetry(input: {
  phase: "ask" | "act";
  modelCandidates: string[];
  request: Record<string, unknown>;
}) {
  const {
    retryAttempts,
    retryBaseDelayMs,
    requestTimeoutMs,
    gatewayApiKey,
    gatewayBaseUrl
  } = getGatewayConnection();
  const uniqueModels = Array.from(new Set(input.modelCandidates.filter(Boolean)));

  let lastError: unknown;

  for (const model of uniqueModels) {
    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
      try {
        return await withGatewayQueueSlot(async () => {
          const startedAt = Date.now();
          const response = await postGatewayResponse({
            model,
            request: input.request,
            timeoutMs: requestTimeoutMs,
            gatewayApiKey,
            gatewayBaseUrl
          });
          const usage = extractUsage(response);
          emitGatewayTelemetry({
            phase: input.phase,
            model,
            attempt,
            latencyMs: Date.now() - startedAt,
            requestId: typeof response.id === "string" ? response.id : null,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            hadToolCalls: extractFunctionCalls(response).length > 0
          });
          return response;
        });
      } catch (error) {
        lastError = error;
        const retryable = isRetryableError(error);
        const canRetryAttempt = attempt < retryAttempts;

        if (!retryable || !canRetryAttempt) {
          break;
        }

        const jitterMs = Math.floor(Math.random() * 100);
        const delayMs = retryBaseDelayMs * 2 ** (attempt - 1) + jitterMs;
        await sleep(delayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI gateway request failed.");
}

export async function runAskConversation(input: {
  mode: AiMode;
  userMessage: string;
  conversation: AiConversationMessage[];
  context: AiResolvedContext;
  callbacks: AiPlanningCallbacks;
}): Promise<AiPlanningResult> {
  const { model, fallbackModels, maxOutputTokens } = getGatewayConnection();
  const playerSummaries = input.context.account.players.slice(0, 10).map((player) => `${player.label}${player.subtitle ? ` (${player.subtitle})` : ""}`);

  const response = await createGatewayResponseWithRetry({
    phase: "ask",
    modelCandidates: [model, ...fallbackModels],
    request: {
      instructions: buildSystemInstructions({
        mode: input.mode,
        canExecute: false,
        orgSlug: input.context.org?.orgSlug ?? null,
        scopeModule: input.context.scope.currentModule,
        activePlayerId: input.context.account.activePlayerId,
        playerSummaries
      }),
      input: toGatewayMessages({
        conversation: input.conversation,
        userMessage: input.userMessage
      }) as unknown,
      max_output_tokens: maxOutputTokens
    }
  });

  const assistantText = extractResponseText(response) || "I can help answer questions and prepare a safe action plan when you provide org context.";
  emitTextInChunks(assistantText, input.callbacks.onAssistantDelta);

  return {
    assistantText,
    proposal: null
  };
}

export async function runActPlanningConversation(input: {
  mode: AiMode;
  userMessage: string;
  conversation: AiConversationMessage[];
  context: AiResolvedContext;
  orgSlug: string;
  entitySelections: Record<string, string>;
  callbacks: AiPlanningCallbacks;
}): Promise<AiPlanningResult> {
  const { model, fallbackModels, maxOutputTokens } = getGatewayConnection();
  const modelCandidates = [model, ...fallbackModels];
  const playerSummaries = input.context.account.players.slice(0, 10).map((player) => `${player.label}${player.subtitle ? ` (${player.subtitle})` : ""}`);

  let proposal: AiProposal | null = null;
  let assistantText = "";

  let response = await createGatewayResponseWithRetry({
    phase: "act",
    modelCandidates,
    request: {
      instructions: buildSystemInstructions({
        mode: input.mode,
        canExecute: input.context.permissionEnvelope.canExecuteOrgActions,
        orgSlug: input.orgSlug,
        scopeModule: input.context.scope.currentModule,
        activePlayerId: input.context.account.activePlayerId,
        playerSummaries
      }),
      input: toGatewayMessages({
        conversation: input.conversation,
        userMessage: input.userMessage
      }) as unknown,
      tools: aiToolDefinitions as unknown,
      max_output_tokens: maxOutputTokens
    }
  });

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const responseText = extractResponseText(response);
    if (responseText) {
      assistantText = `${assistantText}\n${responseText}`.trim();
      emitTextInChunks(responseText, input.callbacks.onAssistantDelta);
    }

    const calls = extractFunctionCalls(response);
    if (calls.length === 0) {
      break;
    }

    const outputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];

    for (const call of calls) {
      const rawArgs = safeJsonParse(call.argumentsJson) as Record<string, unknown>;
      const args: Record<string, unknown> = {
        ...rawArgs,
        orgSlug: (typeof rawArgs.orgSlug === "string" && rawArgs.orgSlug.trim()) || input.orgSlug,
        entitySelections: {
          ...(typeof rawArgs.entitySelections === "object" && rawArgs.entitySelections ? (rawArgs.entitySelections as Record<string, string>) : {}),
          ...input.entitySelections
        }
      };

      if (call.name === "propose_changes") {
        args.dryRun = true;
        if (!args.parameters || typeof args.parameters !== "object") {
          args.parameters = {};
        }

        (args.parameters as Record<string, unknown>).freeText =
          (args.parameters as Record<string, unknown>).freeText ?? input.userMessage;
        (args.parameters as Record<string, unknown>).userMessage = input.userMessage;
      }

      input.callbacks.onToolCall(call.name, args);

      const result = await runAiTool(
        call.name,
        {
          requestContext: input.context,
          mode: input.mode
        },
        args
      );

      input.callbacks.onToolResult(call.name, result);

      if (call.name === "propose_changes") {
        const maybeProposal = (result as { proposal?: AiProposal }).proposal;
        if (maybeProposal) {
          proposal = maybeProposal;
        }
      }

      outputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result)
      });
    }

    response = await createGatewayResponseWithRetry({
      phase: "act",
      modelCandidates,
      request: {
        instructions: buildSystemInstructions({
          mode: input.mode,
          canExecute: input.context.permissionEnvelope.canExecuteOrgActions,
          orgSlug: input.orgSlug,
          scopeModule: input.context.scope.currentModule,
          activePlayerId: input.context.account.activePlayerId,
          playerSummaries
        }),
        previous_response_id: response.id,
        input: outputs as unknown,
        tools: aiToolDefinitions as unknown,
        max_output_tokens: maxOutputTokens
      }
    });
  }

  if (!proposal) {
    const fallbackArgs = {
      orgSlug: input.orgSlug,
      intentType: "auto",
      entities: {},
      parameters: {
        freeText: input.userMessage,
        userMessage: input.userMessage
      },
      entitySelections: input.entitySelections,
      dryRun: true
    };

    input.callbacks.onToolCall("propose_changes", fallbackArgs);
    const fallbackResult = await runAiTool(
      "propose_changes",
      {
        requestContext: input.context,
        mode: input.mode
      },
      fallbackArgs
    );
    input.callbacks.onToolResult("propose_changes", fallbackResult);
    proposal = (fallbackResult as { proposal?: AiProposal }).proposal ?? null;
  }

  if (!assistantText) {
    const fallbackText = proposal?.summary ?? "I prepared a safe planning response.";
    emitTextInChunks(fallbackText, input.callbacks.onAssistantDelta);
    assistantText = fallbackText;
  }

  return {
    assistantText,
    proposal
  };
}
