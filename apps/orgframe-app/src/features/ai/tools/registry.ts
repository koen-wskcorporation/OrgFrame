import type { Permission } from "@/src/features/core/access";
import type { AiToolExecutionContext } from "@/src/features/ai/tools/base";
import { hasRequiredPermissions } from "@/src/features/ai/tools/base";
import { executeChangesTool, type ExecuteChangesResult } from "@/src/features/ai/tools/execute-changes";
import { proposeChangesTool, type ProposeChangesResult } from "@/src/features/ai/tools/propose-changes";
import { proposeWidgetTool, type ProposeWidgetResult } from "@/src/features/ai/tools/propose-widget";
import { queryOrgDataTool, type QueryOrgDataResult } from "@/src/features/ai/tools/query-org-data";
import { resolveEntitiesTool, type ResolveEntitiesResult } from "@/src/features/ai/tools/resolve-entities";
import { widgetTypes } from "@/src/features/manage-dashboard/types";

export const aiTools = {
  resolve_entities: resolveEntitiesTool,
  propose_changes: proposeChangesTool,
  query_org_data: queryOrgDataTool,
  execute_changes: executeChangesTool,
  propose_widget: proposeWidgetTool
} as const;

export type AiToolName = keyof typeof aiTools;

const resolveEntitiesToolDefinition = {
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
};

const proposeChangesToolDefinition = {
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
};

const queryOrgDataToolDefinition = {
  type: "function" as const,
  name: "query_org_data",
  description: queryOrgDataTool.description,
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      orgSlug: { type: "string" },
      metric: { type: "string", enum: ["form_submission_count", "forms_summary", "programs_summary", "events_summary", "org_overview", "rag_retrieve"] },
      question: { type: "string" },
      topK: { type: "integer" },
      formId: { type: "string" },
      formSlug: { type: "string" },
      formName: { type: "string" }
    },
    required: ["orgSlug"]
  }
};

const proposeWidgetToolDefinition = {
  type: "function" as const,
  name: "propose_widget",
  description: proposeWidgetTool.description,
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      orgSlug: { type: "string" },
      widgetType: { type: "string", enum: [...widgetTypes] },
      rationale: { type: "string" }
    },
    required: ["orgSlug", "widgetType"]
  }
};

export const aiAskToolDefinitions = [resolveEntitiesToolDefinition, queryOrgDataToolDefinition, proposeWidgetToolDefinition];
export const aiPlanningToolDefinitions = [resolveEntitiesToolDefinition, proposeChangesToolDefinition, proposeWidgetToolDefinition];
export const aiToolDefinitions = aiPlanningToolDefinitions;

export function canUseTool(grantedPermissions: Permission[], requiredPermissions: Permission[]) {
  return hasRequiredPermissions(grantedPermissions, requiredPermissions);
}

export async function runAiTool(name: "resolve_entities", context: AiToolExecutionContext, input: unknown): Promise<ResolveEntitiesResult>;
export async function runAiTool(name: "propose_changes", context: AiToolExecutionContext, input: unknown): Promise<ProposeChangesResult>;
export async function runAiTool(name: "query_org_data", context: AiToolExecutionContext, input: unknown): Promise<QueryOrgDataResult>;
export async function runAiTool(name: "execute_changes", context: AiToolExecutionContext, input: unknown): Promise<ExecuteChangesResult>;
export async function runAiTool(name: "propose_widget", context: AiToolExecutionContext, input: unknown): Promise<ProposeWidgetResult>;
export async function runAiTool(
  name: AiToolName,
  context: AiToolExecutionContext,
  input: unknown
): Promise<ResolveEntitiesResult | ProposeChangesResult | QueryOrgDataResult | ExecuteChangesResult | ProposeWidgetResult>;
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

  if (name === "query_org_data") {
    const parsed = queryOrgDataTool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Invalid tool input for query_org_data.");
    }
    return queryOrgDataTool.execute(context, parsed.data);
  }

  if (name === "propose_widget") {
    const parsed = proposeWidgetTool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("Invalid tool input for propose_widget.");
    }
    return proposeWidgetTool.execute(context, parsed.data);
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
