import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapActionTypeToVariant, nextCommandSurfaceState, trimConversation, type CommandTurn } from "@/src/features/ai/components/command-surface";

describe("command surface state machine", () => {
  it("follows idle -> typing -> streaming -> awaiting_followup", () => {
    const typing = nextCommandSurfaceState("idle", { type: "input.changed", value: "hello" });
    const streaming = nextCommandSurfaceState(typing, { type: "submit" });
    const awaiting = nextCommandSurfaceState(streaming, { type: "response.completed" });

    assert.equal(typing, "typing");
    assert.equal(streaming, "streaming");
    assert.equal(awaiting, "awaiting_followup");
  });

  it("stays streaming while input changes mid-stream", () => {
    const state = nextCommandSurfaceState("streaming", { type: "input.changed", value: "change" });
    assert.equal(state, "streaming");
  });

  it("supports sidebar handoff and close", () => {
    const handoff = nextCommandSurfaceState("awaiting_followup", { type: "handoff.sidebar" });
    const closed = nextCommandSurfaceState(handoff, { type: "sidebar.closed" });

    assert.equal(handoff, "handoff_sidebar");
    assert.equal(closed, "awaiting_followup");
  });
});

describe("command surface helpers", () => {
  it("trims conversation to max turn count", () => {
    const turns: CommandTurn[] = Array.from({ length: 25 }, (_, index) => ({
      id: `turn-${index}`,
      role: index % 2 ? "assistant" : "user",
      content: `message ${index}`,
      createdAt: index
    }));

    const trimmed = trimConversation(turns, 20);
    assert.equal(trimmed.length, 20);
    assert.equal(trimmed[0]?.id, "turn-5");
    assert.equal(trimmed[19]?.id, "turn-24");
  });

  it("maps action types to button variants", () => {
    assert.equal(mapActionTypeToVariant("handoff_sidebar"), "primary");
    assert.equal(mapActionTypeToVariant("navigate"), "secondary");
    assert.equal(mapActionTypeToVariant("custom"), "ghost");
  });
});
