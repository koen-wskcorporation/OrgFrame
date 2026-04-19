import { z } from "zod";

const textSchema = z.string().trim();
const optionalTextSchema = z.string().trim().min(1).optional();

const aiUiContextSchema = z.object({
  source: z.enum(["command_bar", "workspace"]),
  requestedAt: z.string().trim().min(1).max(80),
  route: z.object({
    pathname: z.string().trim().min(1).max(300),
    search: optionalTextSchema,
    hash: optionalTextSchema,
    title: z.string().trim().min(1).max(180).optional(),
    referrerPath: z.string().trim().min(1).max(300).optional(),
    queryParams: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(200)).optional()
  }),
  page: z.object({
    currentModule: z.enum(["calendar", "facilities", "programs", "teams", "communications", "files", "settings", "profiles", "workspace", "unknown"]).optional(),
    tool: optionalTextSchema,
    entityType: optionalTextSchema,
    entityId: optionalTextSchema,
    orgSlugFromPath: optionalTextSchema
  }),
  selection: z
    .object({
      text: z.string().trim().min(1).max(500).optional(),
      activeElement: z
        .object({
          tagName: z.string().trim().min(1).max(40),
          role: optionalTextSchema,
          id: optionalTextSchema,
          name: optionalTextSchema,
          ariaLabel: z.string().trim().min(1).max(120).optional(),
          placeholder: z.string().trim().min(1).max(120).optional(),
          datasetContext: z.string().trim().min(1).max(120).optional()
        })
        .optional()
    })
    .optional(),
  viewport: z
    .object({
      width: z.number().int().positive().max(12000),
      height: z.number().int().positive().max(12000),
      isMobile: z.boolean()
    })
    .optional(),
  runtime: z
    .object({
      timezone: optionalTextSchema,
      language: optionalTextSchema,
      online: z.boolean().optional(),
      visibilityState: optionalTextSchema
    })
    .optional(),
  workspaceContext: z
    .object({
      view: z.enum(["overview", "data_table", "calendar", "import_review", "visualization", "action_result"]).optional(),
      entityType: optionalTextSchema,
      entityIds: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
      filters: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(200)).optional(),
      importRunId: z.string().trim().min(1).max(120).optional()
    })
    .optional()
});

export const aiConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: textSchema.min(1).max(4000)
});

export const aiRequestSchema = z.object({
  orgSlug: textSchema.min(1).max(80).optional(),
  userMessage: textSchema.min(1).max(4000),
  mode: z.enum(["ask", "act"]),
  conversation: z.array(aiConversationMessageSchema).max(24).default([]),
  threadId: z.string().trim().min(1).max(120).optional(),
  turnId: z.string().trim().min(1).max(120).optional(),
  surface: z.enum(["command", "inline", "sidebar"]).optional(),
  phase: z.enum(["plan", "confirm", "cancel"]).optional().default("plan"),
  proposalId: z.string().uuid().optional(),
  entitySelections: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional().default({}),
  uiContext: aiUiContextSchema.optional()
});

export const aiEntityCandidateSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["governing_body", "program", "program_node", "player", "form", "form_submission", "event"]),
  label: z.string().trim().min(1),
  subtitle: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.string().trim().min(1), z.unknown()).optional()
});

export const aiChangesetSchema = z.object({
  version: z.literal("v1"),
  intentType: z.string().trim().min(1),
  orgId: z.string().uuid(),
  orgSlug: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  preconditions: z.array(
    z.object({
      table: z.string().trim().min(1),
      field: z.string().trim().min(1),
      expected: z.string().nullable(),
      reason: z.string().trim().min(1)
    })
  ),
  operations: z.array(
    z.object({
      kind: z.enum(["insert", "update"]),
      table: z.string().trim().min(1),
      where: z.record(z.string().trim().min(1), z.string().nullable()),
      set: z.record(z.string().trim().min(1), z.string().nullable()),
      before: z.record(z.string().trim().min(1), z.string().nullable()).optional(),
      after: z.record(z.string().trim().min(1), z.string().nullable()).optional()
    })
  ),
  revalidatePaths: z.array(z.string().trim().min(1))
});

export const aiProposalSchema = z.object({
  intentType: z.string().trim().min(1),
  executable: z.boolean(),
  requiredPermissions: z.array(z.string().trim().min(1)),
  summary: z.string().trim().min(1),
  steps: z.array(
    z.object({
      key: z.string().trim().min(1),
      title: z.string().trim().min(1),
      detail: z.string().trim().min(1)
    })
  ),
  changeset: aiChangesetSchema.nullable(),
  warnings: z.array(z.string().trim().min(1)),
  ambiguity: z
    .object({
      key: z.string().trim().min(1),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      candidates: z.array(
        z.object({
          key: z.string().trim().min(1),
          label: z.string().trim().min(1),
          description: z.string().nullable()
        })
      )
    })
    .nullable()
});

export const aiActAuditDetailSchema = z.object({
  prompt: z.string().trim().min(1),
  mode: z.enum(["ask", "act"]),
  phase: z.enum(["plan", "confirm", "cancel"]),
  requestedAt: z.string().trim().min(1),
  proposal: aiProposalSchema.nullable(),
  changeset: aiChangesetSchema.nullable(),
  executed: z.boolean(),
  canceled: z.boolean(),
  canceledAt: z.string().nullable(),
  executedAt: z.string().nullable(),
  executionResult: z
    .object({
      ok: z.boolean(),
      summary: z.string().trim().min(1),
      warnings: z.array(z.string().trim().min(1)),
      appliedChanges: z.number().int().nonnegative()
    })
    .nullable(),
  conversation: z.array(aiConversationMessageSchema)
});

export const resolveEntitiesInputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  freeText: z.string().trim().min(1).max(4000)
});

export const queryOrgDataInputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  metric: z.enum(["form_submission_count", "forms_summary", "programs_summary", "events_summary", "org_overview", "rag_retrieve"]).optional().default("form_submission_count"),
  question: z.string().trim().min(1).max(4000).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  formId: z.string().trim().min(1).optional(),
  formSlug: z.string().trim().min(1).optional(),
  formName: z.string().trim().min(1).max(200).optional()
});

export const proposeChangesInputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  intentType: z.string().trim().min(1),
  entities: z.record(z.string().trim().min(1), z.unknown()).optional().default({}),
  parameters: z.record(z.string().trim().min(1), z.unknown()).optional().default({}),
  entitySelections: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional().default({}),
  dryRun: z.boolean().optional().default(true)
});

export const executeChangesInputSchema = z.object({
  orgSlug: z.string().trim().min(1),
  changeset: aiChangesetSchema,
  execute: z.boolean().optional().default(false)
});
