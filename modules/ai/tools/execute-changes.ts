import { executeChangesInputSchema } from "@/modules/ai/schemas";
import type { AiExecutionResult } from "@/modules/ai/types";
import { executeFormsChangeset } from "@/modules/ai/tools/intents/forms-actions";
import { executeSetOrgGoverningBodyChange } from "@/modules/ai/tools/intents/set-org-governing-body";
import type { AiToolDefinition } from "@/modules/ai/tools/base";

export type ExecuteChangesResult = {
  ok: true;
  result: AiExecutionResult;
};

export const executeChangesTool: AiToolDefinition<typeof executeChangesInputSchema, ExecuteChangesResult> = {
  name: "execute_changes",
  description: "Apply a previously proposed changeset after explicit confirmation.",
  inputSchema: executeChangesInputSchema,
  requiredPermissions: ["org.branding.write"],
  supportsDryRun: true,
  async execute(context, input) {
    if (!context.requestContext.org || context.requestContext.org.orgSlug !== input.orgSlug) {
      throw new Error("Organization context mismatch.");
    }

    if (input.changeset.intentType === "org.set_governing_body") {
      const result = await executeSetOrgGoverningBodyChange({
        context: context.requestContext,
        changeset: input.changeset,
        execute: input.execute
      });

      return {
        ok: true,
        result
      };
    }

    if (input.changeset.intentType.startsWith("forms.")) {
      const result = await executeFormsChangeset({
        context: context.requestContext,
        changeset: input.changeset,
        execute: input.execute
      });

      return {
        ok: true,
        result
      };
    }

    throw new Error(`Unsupported changeset intent: ${input.changeset.intentType}`);
  }
};
