"use client";

import { useCallback, useRef, useState } from "react";
import { CalendarClock, FileText, Inbox, Sparkles, TrendingUp, Users } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { AiComposer } from "@/src/features/ai/components/AiComposer";
import { InlineThread } from "@/src/features/ai/components/InlineThread";
import type { CommandTurn } from "@/src/features/ai/components/command-surface";
import type { AiResultCard, AiSuggestedAction } from "@/src/features/ai/types";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type QuickAction = {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: "What needs attention", prompt: "What needs my attention today across forms, events, programs, and inbox? Give me a prioritized short list.", icon: Sparkles },
  { label: "Summarize this week", prompt: "Summarize activity across this organization over the past 7 days in a concise 4-bullet brief.", icon: TrendingUp },
  { label: "Upcoming events", prompt: "List the next 10 upcoming calendar items for this organization with dates.", icon: CalendarClock },
  { label: "Unresolved inbox", prompt: "Show unresolved inbox conversations that need a response, sorted by oldest first.", icon: Inbox },
  { label: "Form submissions", prompt: "How many form submissions came in this week, and which forms received the most?", icon: FileText },
  { label: "Members overview", prompt: "How many active members are in this organization, and highlight any recent changes.", icon: Users }
];

type AiDashboardProps = {
  orgSlug: string;
  orgName: string;
};

export function AiDashboard({ orgSlug, orgName }: AiDashboardProps) {
  const [turns, setTurns] = useState<CommandTurn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState("");
  const threadIdRef = useRef<string>(createId());

  const hasConversation = turns.length > 0 || Boolean(streaming);

  const runPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || running) return;
      const userTurn: CommandTurn = { id: createId(), role: "user", content: trimmed, createdAt: Date.now() };
      setTurns((prev) => [...prev, userTurn]);
      setValue("");
      setRunning(true);
      setStreaming("");

      const turnId = createId();
      try {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgSlug,
            mode: "ask",
            phase: "plan",
            userMessage: trimmed,
            threadId: threadIdRef.current,
            turnId,
            surface: "command",
            conversation: [...turns, userTurn].map((t) => ({ role: t.role, content: t.content }))
          })
        });
        if (!response.ok || !response.body) {
          setTurns((prev) => [
            ...prev,
            { id: createId(), role: "assistant", content: "The assistant is unavailable right now.", createdAt: Date.now() }
          ]);
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamed = "";
        let finalText = "";
        let meta: { resultCards?: AiResultCard[]; suggestedActions?: AiSuggestedAction[] } | null = null;

        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });
          let idx = buffer.indexOf("\n\n");
          while (idx !== -1) {
            const block = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 2);
            if (block) {
              const lines = block.split("\n");
              let eventName = "";
              const dataLines: string[] = [];
              for (const line of lines) {
                if (line.startsWith("event:")) eventName = line.slice(6).trim();
                else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
              }
              if (eventName && dataLines.length > 0) {
                try {
                  const payload = JSON.parse(dataLines.join("\n")) as {
                    text?: string;
                    resultCards?: AiResultCard[];
                    suggestedActions?: AiSuggestedAction[];
                  };
                  if (eventName === "assistant.delta" && typeof payload.text === "string") {
                    streamed += payload.text;
                    setStreaming(streamed);
                  }
                  if (eventName === "assistant.done" && typeof payload.text === "string") {
                    finalText = payload.text;
                  }
                  if (eventName === "assistant.meta") {
                    meta = {
                      resultCards: Array.isArray(payload.resultCards) ? payload.resultCards : [],
                      suggestedActions: Array.isArray(payload.suggestedActions) ? payload.suggestedActions : []
                    };
                  }
                } catch {}
              }
            }
            idx = buffer.indexOf("\n\n");
          }
        }

        setTurns((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: (finalText || streamed || "No response.").trim(),
            createdAt: Date.now(),
            resultCards: meta?.resultCards,
            suggestedActions: meta?.suggestedActions
          }
        ]);
        setStreaming("");
      } finally {
        setRunning(false);
      }
    },
    [orgSlug, running, turns]
  );

  const clear = useCallback(() => {
    setTurns([]);
    setStreaming("");
    threadIdRef.current = createId();
  }, []);

  if (hasConversation) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-muted">Conversation</h2>
          <Button onClick={clear} size="sm" type="button" variant="ghost">
            New conversation
          </Button>
        </div>
        <InlineThread messages={turns} onAction={() => {}} running={running} streamingText={streaming} />
        <AiComposer
          disabled={running}
          loading={running}
          onChange={setValue}
          onSubmit={() => void runPrompt(value)}
          placeholder="Ask a follow-up…"
          value={value}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-8 md:py-14">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Sparkles className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-text md:text-3xl">
          How can I help you with {orgName}?
        </h1>
        <p className="max-w-md text-sm text-text-muted">
          Ask anything about your organization, or pick a quick action to get started.
        </p>
      </header>

      <AiComposer
        disabled={running}
        loading={running}
        onChange={setValue}
        onSubmit={() => void runPrompt(value)}
        placeholder="Ask anything, or describe a task to start…"
        value={value}
      />

      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text shadow-sm transition-colors hover:border-accent hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              key={action.label}
              onClick={() => void runPrompt(action.prompt)}
              type="button"
            >
              <Icon className="h-4 w-4 text-text-muted" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
