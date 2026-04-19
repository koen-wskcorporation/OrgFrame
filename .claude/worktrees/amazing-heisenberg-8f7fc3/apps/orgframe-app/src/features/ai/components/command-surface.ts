import type { AiResultCard, AiSuggestedAction } from "@/src/features/ai/types";

export type CommandSurfaceState = "idle" | "typing" | "streaming" | "awaiting_followup" | "handoff_sidebar";

export type CommandSurfaceEvent =
  | { type: "input.changed"; value: string }
  | { type: "submit" }
  | { type: "response.completed" }
  | { type: "handoff.sidebar" }
  | { type: "thread.cleared" }
  | { type: "sidebar.closed" };

export function nextCommandSurfaceState(current: CommandSurfaceState, event: CommandSurfaceEvent): CommandSurfaceState {
  switch (event.type) {
    case "input.changed": {
      if (current === "streaming") {
        return current;
      }
      return event.value.trim() ? "typing" : "idle";
    }
    case "submit":
      return "streaming";
    case "response.completed":
      return "awaiting_followup";
    case "handoff.sidebar":
      return "handoff_sidebar";
    case "thread.cleared":
      return "idle";
    case "sidebar.closed":
      return "awaiting_followup";
    default:
      return current;
  }
}

export type CommandTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  resultCards?: AiResultCard[];
  suggestedActions?: AiSuggestedAction[];
};

export function trimConversation(messages: CommandTurn[], maxTurns = 20): CommandTurn[] {
  if (messages.length <= maxTurns) {
    return messages;
  }
  return messages.slice(messages.length - maxTurns);
}

export function mapActionTypeToVariant(actionType: string): "primary" | "secondary" | "ghost" {
  if (actionType === "handoff_sidebar") {
    return "primary";
  }

  if (actionType === "navigate") {
    return "secondary";
  }

  return "ghost";
}
