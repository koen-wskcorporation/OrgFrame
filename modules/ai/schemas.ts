import { z } from "zod";

const textSchema = z.string().trim();

export const aiConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: textSchema.min(1).max(4000)
});

export const aiRequestSchema = z.object({
  orgSlug: textSchema.min(1).max(80).optional(),
  userMessage: textSchema.min(1).max(4000),
  mode: z.enum(["ask", "act"]),
  conversation: z.array(aiConversationMessageSchema).max(24).default([]),
  phase: z.enum(["plan", "confirm", "cancel"]).optional().default("plan"),
  proposalId: z.string().uuid().optional(),
  entitySelections: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional().default({})
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
