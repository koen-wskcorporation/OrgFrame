import type { AiProposal } from "@/src/features/ai/types";

const pendingIntentLabels: Record<string, string> = {
  "players.move_registration": "Move player between divisions",
  "programs.update_schedule": "Update program schedule",
  "billing.update_plan": "Update billing plan",
  "pages.create_page": "Create org site page"
};

export function proposeStubIntent(intentType: string): AiProposal {
  const label = pendingIntentLabels[intentType] ?? "Requested action";

  return {
    intentType,
    executable: false,
    requiredPermissions: [],
    summary: `${label} is not wired for execution yet.`,
    steps: [
      {
        key: "todo",
        title: "Future tool",
        detail: "This intent is reserved and currently returns a planning stub."
      }
    ],
    changeset: null,
    warnings: ["This intent is not implemented yet."],
    ambiguity: null
  };
}
