import type { Permission } from "@/modules/core/access";
import type { AiToolExecutionContext } from "@/modules/ai/tools/base";
import { hasRequiredPermissions } from "@/modules/ai/tools/base";
import { executeChangesTool, type ExecuteChangesResult } from "@/modules/ai/tools/execute-changes";
import { proposeChangesTool, type ProposeChangesResult } from "@/modules/ai/tools/propose-changes";
import { resolveEntitiesTool, type ResolveEntitiesResult } from "@/modules/ai/tools/resolve-entities";

export const aiTools = {
  resolve_entities: resolveEntitiesTool,
  propose_changes: proposeChangesTool,
  execute_changes: executeChangesTool
} as const;

export type AiToolName = keyof typeof aiTools;

export const openAiToolDefinitions = [
  {
    type: "function" as const,
    name: "resolve_entities",
    description: resolveEntitiesTool.description,
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        orgSlug: { type: "string" },
        freeText: { type: "string" }
      },
      required: ["orgSlug", "freeText"]
    }
  },
  {
    type: "function" as const,
    name: "propose_changes",
    description: proposeChangesTool.description,
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        orgSlug: { type: "string" },
        intentType: { type: "string" },
        entities: {
          type: "object",
          additionalProperties: true
        },
        parameters: {
          type: "object",
          additionalProperties: true
        },
        entitySelections: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        dryRun: { type: "boolean" }
      },
      required: ["orgSlug", "intentType"]
    }
  }
];

export function canUseTool(grantedPermissions: Permission[], requiredPermissions: Permission[]) {
  return hasRequiredPermissions(grantedPermissions, requiredPermissions);
}

export async function runAiTool(name: "resolve_entities", context: AiToolExecutionContext, input: unknown): Promise<ResolveEntitiesResult>;
export async function runAiTool(name: "propose_changes", context: AiToolExecutionContext, input: unknown): Promise<ProposeChangesResult>;
export async function runAiTool(name: "execute_changes", context: AiToolExecutionContext, input: unknown): Promise<ExecuteChangesResult>;
export async function runAiTool(
  name: AiToolName,
  context: AiToolExecutionContext,
  input: unknown
): Promise<ResolveEntitiesResult | ProposeChangesResult | ExecuteChangesResult>;
export async function runAiTool(name: AiToolName, context: AiToolExecutionContext, input: unknown) {
  if (name === "resolve_entities") {
    if (!canUseTool(context.requestContext.permissionEnvelope.permissions, resolveEntitiesTool.requiredPermissions)) {
      throw new Error("Insufficient permissions for AI tool execution.");
    }
    const parsed = resolveEntitiesTool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Invalid tool input for resolve_entities.");
    }
    return resolveEntitiesTool.execute(context, parsed.data);
  }

  if (name === "propose_changes") {
    if (!canUseTool(context.requestContext.permissionEnvelope.permissions, proposeChangesTool.requiredPermissions)) {
      throw new Error("Insufficient permissions for AI tool execution.");
    }
    const parsed = proposeChangesTool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Invalid tool input for propose_changes.");
    }
    return proposeChangesTool.execute(context, parsed.data);
  }

  if (!canUseTool(context.requestContext.permissionEnvelope.permissions, executeChangesTool.requiredPermissions)) {
    throw new Error("Insufficient permissions for AI tool execution.");
  }
  const parsed = executeChangesTool.inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid tool input for execute_changes.");
  }
  return executeChangesTool.execute(context, parsed.data);
}
