import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveAssistantMeta } from "@/src/features/ai/metadata";

describe("deriveAssistantMeta", () => {
  it("builds player and account cards with actions", () => {
    const meta = deriveAssistantMeta({
      prompt: "Show player profile and guardian account details",
      assistantText: "I found the player profile and account details.",
      orgSlug: "acme"
    });

    const types = new Set(meta.resultCards.map((card) => card.type));
    assert.equal(types.has("player"), true);
    assert.equal(types.has("account"), true);
    assert.equal(meta.suggestedActions.some((action) => action.label.toLowerCase().includes("guardian")), true);
  });

  it("builds schedule and event actions for calendar prompts", () => {
    const meta = deriveAssistantMeta({
      prompt: "Move this event to Sunday and update the schedule",
      assistantText: "I can reschedule the game and update the calendar timeline.",
      orgSlug: "acme"
    });

    const actionLabels = meta.suggestedActions.map((action) => action.label.toLowerCase());
    assert.equal(actionLabels.some((label) => label.includes("reschedule")), true);
    assert.equal(actionLabels.some((label) => label.includes("schedule")), true);
  });

  it("returns fallback action when no card context matches", () => {
    const meta = deriveAssistantMeta({
      prompt: "Help me think this through",
      assistantText: "Here is an approach.",
      orgSlug: "acme"
    });

    assert.equal(meta.resultCards.length, 0);
    assert.equal(meta.suggestedActions.some((action) => action.actionType === "handoff_sidebar"), true);
  });
});
