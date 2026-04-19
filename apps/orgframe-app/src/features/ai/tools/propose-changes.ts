import { proposeChangesInputSchema } from "@/src/features/ai/schemas";
import type { AiProposal } from "@/src/features/ai/types";
import {
  proposeCreateFormAction,
  proposeUpdateFormBuilderAction,
  proposeUpdateResponseStatusAction
} from "@/src/features/ai/tools/intents/forms-actions";
import { proposeSetOrgGoverningBody } from "@/src/features/ai/tools/intents/set-org-governing-body";
import {
  proposeAssignPlayerTeamAction,
  proposeCreateTeamAction,
  proposeCreatePracticeAction,
  proposeUpdatePlayerProfileAction
} from "@/src/features/ai/tools/intents/workspace-actions";
import { proposeStubIntent } from "@/src/features/ai/tools/intents/stub-intents";
import type { AiToolDefinition } from "@/src/features/ai/tools/base";

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

  if (freeText.includes("jersey") || (freeText.includes("player") && freeText.includes("update"))) {
    return "players.update_profile_fields";
  }

  if ((freeText.includes("assign") || freeText.includes("add")) && freeText.includes("team") && freeText.includes("player")) {
    return "teams.assign_player";
  }

  if ((freeText.includes("create") || freeText.includes("new")) && freeText.includes("team")) {
    return "teams.create_team";
  }

  if ((freeText.includes("schedule") || freeText.includes("create")) && freeText.includes("practice")) {
    return "calendar.create_practice";
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

    if (intentType === "players.update_profile_fields") {
      const proposal = await proposeUpdatePlayerProfileAction({
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

    if (intentType === "teams.assign_player") {
      const proposal = await proposeAssignPlayerTeamAction({
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

    if (intentType === "teams.create_team") {
      const proposal = await proposeCreateTeamAction({
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

    if (intentType === "calendar.create_practice") {
      const proposal = await proposeCreatePracticeAction({
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
