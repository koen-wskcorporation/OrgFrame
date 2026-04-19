import { z } from "zod";
import type { AiToolDefinition } from "@/src/features/ai/tools/base";
import { widgetTypes, type WidgetType } from "@/src/features/manage-dashboard/types";
import { widgetMetadata } from "@/src/features/manage-dashboard/widgets/metadata";

export const proposeWidgetInputSchema = z.object({
  orgSlug: z.string().min(1),
  widgetType: z.enum(widgetTypes),
  rationale: z.string().optional()
});

export type ProposeWidgetResult = {
  ok: true;
  orgSlug: string;
  widget: {
    type: WidgetType;
    title: string;
    description: string;
  };
  rationale: string;
};

export const proposeWidgetTool: AiToolDefinition<typeof proposeWidgetInputSchema, ProposeWidgetResult> = {
  name: "propose_widget",
  description:
    "Propose a dashboard widget to pin on the user's manage dashboard. Returns the widget spec so the UI can render an 'Add this widget' CTA. Does not mutate any state.",
  inputSchema: proposeWidgetInputSchema,
  requiredPermissions: [],
  supportsDryRun: true,
  async execute(_context, input) {
    const meta = widgetMetadata[input.widgetType];
    return {
      ok: true,
      orgSlug: input.orgSlug,
      widget: {
        type: meta.type,
        title: meta.title,
        description: meta.description
      },
      rationale: input.rationale ?? ""
    };
  }
};
