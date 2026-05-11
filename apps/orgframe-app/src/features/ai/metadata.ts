import type { AiResultCard, AiSuggestedAction } from "@/src/features/ai/types";

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function makeId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function extractTitleFromPrompt(prompt: string) {
  const match = prompt.match(/(?:for|named|called)\s+["']?([^"'.,!?]{2,80})/i);
  if (!match) {
    return undefined;
  }

  const value = cleanText(match[1] ?? "");
  return value || undefined;
}

function buildPlayerCard(input: { prompt: string; orgSlug?: string }) {
  const title = extractTitleFromPrompt(input.prompt) ?? "Player";
  const href = input.orgSlug ? `/${input.orgSlug}/manage/people` : "/profiles";

  const card: AiResultCard = {
    id: makeId("player"),
    type: "player",
    title,
    subtitle: "Player",
    fields: [{ label: "Status", value: "Active" }],
    href
  };

  const actions: AiSuggestedAction[] = [
    {
      id: makeId("action"),
      label: "Open player",
      actionType: "navigate",
      payload: { href: "/profiles" }
    },
    {
      id: makeId("action"),
      label: "Link guardian",
      actionType: "navigate",
      payload: { href: "/profiles", intent: "link-guardian" }
    }
  ];

  return { card, actions };
}

function buildAccountCard() {
  const card: AiResultCard = {
    id: makeId("account"),
    type: "account",
    title: "Account summary",
    subtitle: "Guardian account",
    fields: [{ label: "Area", value: "Profile and access" }],
    href: "/settings"
  };

  const actions: AiSuggestedAction[] = [
    {
      id: makeId("action"),
      label: "Open account",
      actionType: "navigate",
      payload: { href: "/settings" }
    }
  ];

  return { card, actions };
}

function buildEventCard(input: { prompt: string; orgSlug?: string }) {
  const title = extractTitleFromPrompt(input.prompt) ?? "Event";
  const href = input.orgSlug ? `/${input.orgSlug}/manage/calendar` : "/settings";

  const card: AiResultCard = {
    id: makeId("event"),
    type: "event",
    title,
    subtitle: "Calendar event",
    badges: ["Schedule"],
    href
  };

  const actions: AiSuggestedAction[] = [
    {
      id: makeId("action"),
      label: "Open calendar",
      actionType: "navigate",
      payload: { href }
    },
    {
      id: makeId("action"),
      label: "Reschedule",
      actionType: "navigate",
      payload: { href, intent: "reschedule" }
    }
  ];

  return { card, actions };
}

function buildScheduleCard(input: { orgSlug?: string }) {
  const href = input.orgSlug ? `/${input.orgSlug}/manage/calendar` : "/settings";
  const card: AiResultCard = {
    id: makeId("schedule"),
    type: "schedule",
    title: "Schedule snapshot",
    subtitle: "Upcoming calendar windows",
    badges: ["Timeline"],
    href
  };

  const actions: AiSuggestedAction[] = [
    {
      id: makeId("action"),
      label: "Open full schedule",
      actionType: "navigate",
      payload: { href }
    },
    {
      id: makeId("action"),
      label: "Notify participants",
      actionType: "navigate",
      payload: { href: input.orgSlug ? `/${input.orgSlug}/manage/inbox` : "/settings" }
    }
  ];

  return { card, actions };
}

export function deriveAssistantMeta(input: {
  prompt: string;
  assistantText: string;
  orgSlug?: string;
}): {
  resultCards: AiResultCard[];
  suggestedActions: AiSuggestedAction[];
} {
  const prompt = cleanText(input.prompt).toLowerCase();
  const response = cleanText(input.assistantText).toLowerCase();
  const cards: AiResultCard[] = [];
  const actions: AiSuggestedAction[] = [];

  const hasPlayer = /\bplayer\b/.test(prompt) || /\bplayer\b/.test(response);
  const hasAccount = /\baccount\b|\bguardian\b|\bprofile\b/.test(prompt);
  const hasEvent = /\bevent\b|\bgame\b|\bpractice\b/.test(prompt) || /\bevent\b|\bgame\b|\bpractice\b/.test(response);
  const hasSchedule = /\bschedule\b|\bcalendar\b|\breschedul/.test(prompt) || /\bschedule\b|\bcalendar\b|\breschedul/.test(response);

  if (hasPlayer) {
    const { card, actions: nextActions } = buildPlayerCard({ prompt: input.prompt, orgSlug: input.orgSlug });
    cards.push(card);
    actions.push(...nextActions);
  }

  if (hasAccount) {
    const { card, actions: nextActions } = buildAccountCard();
    cards.push(card);
    actions.push(...nextActions);
  }

  if (hasEvent) {
    const { card, actions: nextActions } = buildEventCard({ prompt: input.prompt, orgSlug: input.orgSlug });
    cards.push(card);
    actions.push(...nextActions);
  }

  if (hasSchedule) {
    const { card, actions: nextActions } = buildScheduleCard({ orgSlug: input.orgSlug });
    cards.push(card);
    actions.push(...nextActions);
  }

  if (cards.length === 0) {
    actions.push({
      id: makeId("action"),
      label: "Continue in Sidebar",
      actionType: "handoff_sidebar",
      payload: {}
    });
  }

  return {
    resultCards: cards,
    suggestedActions: actions
  };
}
