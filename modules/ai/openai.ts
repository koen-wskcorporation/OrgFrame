import OpenAI from "openai";
import { getAiConfig } from "@/modules/ai/config";
import type { AiConversationMessage, AiMode, AiProposal, AiResolvedContext } from "@/modules/ai/types";
import { openAiToolDefinitions, runAiTool } from "@/modules/ai/tools";

type PlanningToolName = "resolve_entities" | "propose_changes";

export type AiPlanningCallbacks = {
  onAssistantDelta: (text: string) => void;
  onToolCall: (name: string, input: unknown) => void;
  onToolResult: (name: string, output: unknown) => void;
};

export type AiPlanningResult = {
  assistantText: string;
  proposal: AiProposal | null;
};

function createOpenAiClient() {
  const config = getAiConfig();
  return {
    model: config.model,
    client: new OpenAI({ apiKey: config.apiKey })
  };
}

function buildSystemInstructions(input: {
  mode: AiMode;
  canExecute: boolean;
  orgSlug: string | null;
}) {
  const orgInstruction = input.orgSlug
    ? `Current org context is \`${input.orgSlug}\`. Keep any org action scoped to this org.`
    : "No org context is available. Never propose executable org mutations.";

  return [
    "You are Sports SaaS AI Assistant for admin workflows.",
    "Never mutate data directly from this planning interaction.",
    "For action requests: first resolve entities, then propose a structured dry-run plan.",
    "Only use provided tools for grounded actions and avoid hallucinated entities.",
    "If the request is ambiguous, ask for specific selection and provide candidates.",
    orgInstruction,
    input.mode === "ask" || !input.canExecute
      ? "This is ask mode or insufficient-permission context. You may answer questions, but do not propose executable changesets."
      : "This is act planning mode. You must return a confirmable proposal and changeset before execution.",
    "Keep responses concise and operational."
  ].join("\n");
}

function toOpenAiMessages(input: { conversation: AiConversationMessage[]; userMessage: string }) {
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

function extractResponseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const texts: string[] = [];

  for (const item of output) {
    if (item?.type !== "message") {
      continue;
    }

    const content = Array.isArray(item?.content) ? item.content : [];

    for (const entry of content) {
      if (entry?.type === "output_text" && typeof entry?.text === "string") {
        texts.push(entry.text);
      }
    }
  }

  return texts.join("\n").trim();
}

function extractFunctionCalls(response: any): Array<{ name: PlanningToolName; callId: string; argumentsJson: string }> {
  const output = Array.isArray(response?.output) ? response.output : [];

  return output
    .filter((item: any) => item?.type === "function_call" && typeof item?.name === "string" && typeof item?.call_id === "string")
    .map((item: any) => ({
      name: item.name as PlanningToolName,
      callId: item.call_id,
      argumentsJson: typeof item.arguments === "string" ? item.arguments : "{}"
    }));
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

export async function runAskConversation(input: {
  mode: AiMode;
  userMessage: string;
  conversation: AiConversationMessage[];
  context: AiResolvedContext;
  callbacks: AiPlanningCallbacks;
}): Promise<AiPlanningResult> {
  const { client, model } = createOpenAiClient();

  const response = await client.responses.create({
    model,
    instructions: buildSystemInstructions({
      mode: input.mode,
      canExecute: false,
      orgSlug: input.context.org?.orgSlug ?? null
    }),
    input: toOpenAiMessages({
      conversation: input.conversation,
      userMessage: input.userMessage
    }) as any
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
  const { client, model } = createOpenAiClient();
  let proposal: AiProposal | null = null;
  let assistantText = "";

  let response: any = await client.responses.create({
    model,
    instructions: buildSystemInstructions({
      mode: input.mode,
      canExecute: input.context.permissionEnvelope.canExecuteOrgActions,
      orgSlug: input.orgSlug
    }),
    input: toOpenAiMessages({
      conversation: input.conversation,
      userMessage: input.userMessage
    }) as any,
    tools: openAiToolDefinitions as any
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

      const result = await runAiTool(call.name, {
        requestContext: input.context,
        mode: input.mode
      }, args);

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

    response = await client.responses.create({
      model,
      instructions: buildSystemInstructions({
        mode: input.mode,
        canExecute: input.context.permissionEnvelope.canExecuteOrgActions,
        orgSlug: input.orgSlug
      }),
      previous_response_id: response.id,
      input: outputs as any,
      tools: openAiToolDefinitions as any
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
