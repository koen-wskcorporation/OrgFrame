import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createActAuditLog, getActAuditLogForActor, updateActAuditLog } from "@/modules/ai/audit";
import { MissingOpenAiKeyError } from "@/modules/ai/config";
import { resolveAiContext } from "@/modules/ai/context";
import { runActPlanningConversation, runAskConversation } from "@/modules/ai/openai";
import { consumeAiRateLimit } from "@/modules/ai/rate-limit";
import { aiRequestSchema } from "@/modules/ai/schemas";
import { createSseResponse } from "@/modules/ai/sse";
import { runAiTool } from "@/modules/ai/tools";
import type { AiActAuditDetail, AiConversationMessage, AiMode } from "@/modules/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROPOSAL_TTL_MS = 30 * 60 * 1000;

function trimmedConversation(conversation: AiConversationMessage[]) {
  return conversation.slice(-12);
}

function nowIso() {
  return new Date().toISOString();
}

function createInitialAuditDetail(input: {
  prompt: string;
  mode: AiMode;
  phase: "plan" | "confirm" | "cancel";
  conversation: AiConversationMessage[];
}): AiActAuditDetail {
  return {
    prompt: input.prompt,
    mode: input.mode,
    phase: input.phase,
    requestedAt: nowIso(),
    proposal: null,
    changeset: null,
    executed: false,
    canceled: false,
    canceledAt: null,
    executedAt: null,
    executionResult: null,
    conversation: input.conversation
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.json().catch(() => null);
  const parsed = aiRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid AI request payload."
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const payload = parsed.data;

  return createSseResponse(async (emit) => {
    const context = await resolveAiContext(payload.orgSlug);

    if (!context) {
      emit("error", {
        code: "unauthenticated",
        message: "You must be signed in to use AI Assistant.",
        retryable: false
      });
      return;
    }

    const rateLimit = await consumeAiRateLimit(context.userId).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "Rate limit unavailable.");
    });

    if (!rateLimit.allowed) {
      emit("error", {
        code: "rate_limited",
        message: `Rate limit exceeded. Try again after ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
        retryable: true
      });
      return;
    }

    if (payload.orgSlug && !context.org) {
      emit("error", {
        code: "org_not_found",
        message: "Organization context could not be resolved.",
        retryable: false
      });
      return;
    }

    if (payload.phase === "confirm") {
      if (!payload.proposalId) {
        emit("error", {
          code: "missing_proposal",
          message: "Missing proposal id for confirmation.",
          retryable: false
        });
        return;
      }

      const auditLog = await getActAuditLogForActor(payload.proposalId, context.userId);
      if (!auditLog) {
        emit("error", {
          code: "proposal_not_found",
          message: "Proposed action was not found.",
          retryable: false
        });
        return;
      }

      const ageMs = Date.now() - new Date(auditLog.createdAt).getTime();
      if (ageMs > PROPOSAL_TTL_MS) {
        emit("error", {
          code: "proposal_expired",
          message: "This proposal has expired. Request a fresh plan.",
          retryable: false
        });
        return;
      }

      if (auditLog.detail.executed) {
        emit("error", {
          code: "proposal_already_executed",
          message: "This proposal has already been executed.",
          retryable: false
        });
        return;
      }

      if (auditLog.detail.canceled) {
        emit("error", {
          code: "proposal_canceled",
          message: "This proposal was canceled.",
          retryable: false
        });
        return;
      }

      if (!auditLog.detail.changeset || !context.org || context.org.orgId !== auditLog.orgId) {
        emit("error", {
          code: "invalid_changeset",
          message: "Stored proposal is missing a valid changeset.",
          retryable: false
        });
        return;
      }

      let execution;
      try {
        execution = await runAiTool(
          "execute_changes",
          {
            requestContext: context,
            mode: "act"
          },
          {
            orgSlug: context.org.orgSlug,
            changeset: auditLog.detail.changeset,
            execute: true
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Execution failed.";
        const isStale = message.toLowerCase().includes("stale");
        const isForbidden = message.toLowerCase().includes("permission");
        emit("error", {
          code: isStale ? "stale_changeset" : isForbidden ? "insufficient_permissions" : "execution_failed",
          message,
          retryable: isStale
        });
        return;
      }

      const executionResult = execution.result;

      for (const path of auditLog.detail.changeset.revalidatePaths) {
        revalidatePath(path);
      }

      const updatedDetail: AiActAuditDetail = {
        ...auditLog.detail,
        phase: "confirm",
        executed: true,
        executedAt: nowIso(),
        executionResult
      };

      await updateActAuditLog({
        proposalId: auditLog.id,
        actorUserId: context.userId,
        action: "ai.act.execute",
        entityType: "org",
        entityId: context.org.orgId,
        detail: updatedDetail
      });

      emit("execution.result", {
        proposalId: auditLog.id,
        result: executionResult
      });

      emit("assistant.done", {
        text: executionResult.summary
      });

      return;
    }

    if (payload.phase === "cancel") {
      if (!payload.proposalId) {
        emit("error", {
          code: "missing_proposal",
          message: "Missing proposal id for cancellation.",
          retryable: false
        });
        return;
      }

      const auditLog = await getActAuditLogForActor(payload.proposalId, context.userId);

      if (!auditLog) {
        emit("error", {
          code: "proposal_not_found",
          message: "Proposal was not found.",
          retryable: false
        });
        return;
      }

      const canceledDetail: AiActAuditDetail = {
        ...auditLog.detail,
        phase: "cancel",
        canceled: true,
        canceledAt: nowIso()
      };

      await updateActAuditLog({
        proposalId: auditLog.id,
        actorUserId: context.userId,
        action: "ai.act.cancel",
        entityType: "org",
        entityId: auditLog.orgId,
        detail: canceledDetail
      });

      emit("execution.result", {
        proposalId: auditLog.id,
        result: {
          ok: true,
          summary: "Canceled proposed changes.",
          warnings: [],
          appliedChanges: 0
        }
      });

      emit("assistant.done", {
        text: "Canceled proposed changes. No data was modified."
      });

      return;
    }

    const conversation = trimmedConversation(payload.conversation);
    const hasOrgContext = Boolean(context.org && payload.orgSlug);
    const canExecuteInOrg = hasOrgContext && context.permissionEnvelope.canExecuteOrgActions;

    let planningMode = payload.mode;
    if (payload.mode === "act" && !hasOrgContext) {
      planningMode = "ask";
      emit("error", {
        code: "missing_org_context",
        message: "Act mode requires an organization context.",
        retryable: false
      });
    }

    if (payload.mode === "act" && hasOrgContext && !canExecuteInOrg) {
      planningMode = "ask";
      emit("error", {
        code: "insufficient_permissions",
        message: "You can ask questions, but you do not have permission to execute org actions.",
        retryable: false
      });
    }

    let planningResult;

    try {
      if (planningMode === "act" && context.org) {
        planningResult = await runActPlanningConversation({
          mode: planningMode,
          userMessage: payload.userMessage,
          conversation,
          context,
          orgSlug: context.org.orgSlug,
          entitySelections: payload.entitySelections,
          callbacks: {
            onAssistantDelta(text) {
              emit("assistant.delta", { text });
            },
            onToolCall(name, input) {
              emit("tool.call", { name, input });
            },
            onToolResult(name, output) {
              emit("tool.result", { name, output });
            }
          }
        });
      } else {
        planningResult = await runAskConversation({
          mode: planningMode,
          userMessage: payload.userMessage,
          conversation,
          context,
          callbacks: {
            onAssistantDelta(text) {
              emit("assistant.delta", { text });
            },
            onToolCall(name, input) {
              emit("tool.call", { name, input });
            },
            onToolResult(name, output) {
              emit("tool.result", { name, output });
            }
          }
        });
      }
    } catch (error) {
      if (error instanceof MissingOpenAiKeyError) {
        emit("error", {
          code: "missing_openai_api_key",
          message: "OPENAI_API_KEY is not configured on the server.",
          retryable: false
        });
        return;
      }

      const message = error instanceof Error ? error.message : "Unable to complete AI request.";
      emit("error", {
        code: "openai_error",
        message,
        retryable: true
      });
      return;
    }

    let proposalId: string | null = null;

    if (payload.mode === "act" && context.org) {
      const auditDetail: AiActAuditDetail = {
        ...createInitialAuditDetail({
          prompt: payload.userMessage,
          mode: payload.mode,
          phase: "plan",
          conversation
        }),
        proposal: planningResult.proposal,
        changeset: planningResult.proposal?.changeset ?? null
      };

      const auditEntry = await createActAuditLog({
        org: context.org,
        actorUserId: context.userId,
        action: "ai.act.plan",
        entityType: "org",
        entityId: context.org.orgId,
        detail: auditDetail
      });

      proposalId = auditEntry.id;
    }

    if (planningResult.proposal) {
      emit("proposal.ready", {
        proposalId,
        proposal: planningResult.proposal
      });
    }

    emit("assistant.done", {
      text: planningResult.assistantText
    });
  });
}
