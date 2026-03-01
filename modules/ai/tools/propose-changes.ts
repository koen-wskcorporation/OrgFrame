import { proposeChangesInputSchema } from "@/modules/ai/schemas";
import type { AiProposal } from "@/modules/ai/types";
import {
  proposeCreateFormAction,
  proposeUpdateFormBuilderAction,
  proposeUpdateResponseStatusAction
} from "@/modules/ai/tools/intents/forms-actions";
import { proposeSetOrgGoverningBody } from "@/modules/ai/tools/intents/set-org-governing-body";
import { proposeStubIntent } from "@/modules/ai/tools/intents/stub-intents";
import type { AiToolDefinition } from "@/modules/ai/tools/base";

export type ProposeChangesResult = {
  ok: true;
  proposal: AiProposal;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function inferIntent(intentType: string, parameters: Record<string, unknown>) {
  if (intentType && intentType !== "auto") {
    return intentType;
  }

  const freeText = `${cleanText(parameters.freeText)} ${cleanText(parameters.userMessage)} ${cleanText(parameters.targetName)}`.toLowerCase();

  if (freeText.includes("governing body") || freeText.includes("little league") || freeText.includes("usssa") || freeText.includes("aau")) {
    return "org.set_governing_body";
  }

  if (
    (freeText.includes("response") || freeText.includes("submission")) &&
    (freeText.includes("approve") || freeText.includes("reject") || freeText.includes("waitlist") || freeText.includes("in review") || freeText.includes("cancel"))
  ) {
    return "forms.responses.update_status";
  }

  if (freeText.includes("create form") || freeText.includes("new form") || freeText.includes("build form")) {
    return "forms.create_form";
  }

  if (freeText.includes("form") && (freeText.includes("rename") || freeText.includes("update") || freeText.includes("publish") || freeText.includes("archive"))) {
    return "forms.update_form_builder";
  }

  if (freeText.includes("move") && freeText.includes("player")) {
    return "players.move_registration";
  }

  if (freeText.includes("schedule")) {
    return "programs.update_schedule";
  }

  if (freeText.includes("billing")) {
    return "billing.update_plan";
  }

  if (freeText.includes("page") || freeText.includes("nav")) {
    return "pages.create_page";
  }

  return "org.set_governing_body";
}

export const proposeChangesTool: AiToolDefinition<typeof proposeChangesInputSchema, ProposeChangesResult> = {
  name: "propose_changes",
  description: "Generate a structured, dry-run proposal and changeset for an org-scoped admin action.",
  inputSchema: proposeChangesInputSchema,
  requiredPermissions: [],
  supportsDryRun: true,
  async execute(context, input) {
    const intentType = inferIntent(input.intentType, input.parameters);

    if (intentType === "org.set_governing_body") {
      const proposal = await proposeSetOrgGoverningBody({
        context: context.requestContext,
        orgSlug: input.orgSlug,
        parameters: {
          ...input.parameters,
          freeText: cleanText(input.parameters.freeText) || cleanText(input.parameters.userMessage)
        },
        entitySelections: input.entitySelections
      });

      return {
        ok: true,
        proposal
      };
    }

    if (intentType === "forms.create_form") {
      const proposal = await proposeCreateFormAction({
        context: context.requestContext,
        orgSlug: input.orgSlug,
        parameters: {
          ...input.parameters,
          freeText: cleanText(input.parameters.freeText) || cleanText(input.parameters.userMessage)
        }
      });

      return {
        ok: true,
        proposal
      };
    }

    if (intentType === "forms.update_form_builder") {
      const proposal = await proposeUpdateFormBuilderAction({
        context: context.requestContext,
        orgSlug: input.orgSlug,
        parameters: {
          ...input.parameters,
          freeText: cleanText(input.parameters.freeText) || cleanText(input.parameters.userMessage)
        },
        entitySelections: input.entitySelections
      });

      return {
        ok: true,
        proposal
      };
    }

    if (intentType === "forms.responses.update_status") {
      const proposal = await proposeUpdateResponseStatusAction({
        context: context.requestContext,
        orgSlug: input.orgSlug,
        parameters: {
          ...input.parameters,
          freeText: cleanText(input.parameters.freeText) || cleanText(input.parameters.userMessage)
        },
        entitySelections: input.entitySelections
      });

      return {
        ok: true,
        proposal
      };
    }

    return {
      ok: true,
      proposal: proposeStubIntent(intentType)
    };
  }
};
