"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { AiComposer } from "@/src/features/ai/components/AiComposer";
import { InlineThread } from "@/src/features/ai/components/InlineThread";
import type { CommandTurn } from "@/src/features/ai/components/command-surface";
import type { AiResultCard, AiSuggestedAction } from "@/src/features/ai/types";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type AiCommandPanelProps = {
  orgSlug: string;
};

export function AiCommandPanel({ orgSlug }: AiCommandPanelProps) {
  const [turns, setTurns] = useState<CommandTurn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [running, setRunning] = useState(false);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const threadIdRef = useRef<string>(createId());

  const submit = useCallback(async () => {
    const prompt = value.trim();
    if (!prompt || running) return;
    const userTurn: CommandTurn = { id: createId(), role: "user", content: prompt, createdAt: Date.now() };
    setTurns((prev) => [...prev, userTurn]);
    setValue("");
    setRunning(true);
    setOpen(true);
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
          userMessage: prompt,
          threadId: threadIdRef.current,
          turnId,
          surface: "command",
          conversation: [...turns, userTurn].map((t) => ({ role: t.role, content: t.content }))
        })
      });
      if (!response.ok || !response.body) {
        setTurns((prev) => [...prev, { id: createId(), role: "assistant", content: "The assistant is unavailable right now.", createdAt: Date.now() }]);
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
                const payload = JSON.parse(dataLines.join("\n")) as { text?: string; resultCards?: AiResultCard[]; suggestedActions?: AiSuggestedAction[] };
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
  }, [orgSlug, running, turns, value]);

  const clear = useCallback(() => {
    setTurns([]);
    setStreaming("");
    threadIdRef.current = createId();
  }, []);

  return (
    <div>
      <AiComposer
        disabled={running}
        loading={running}
        onChange={setValue}
        onSubmit={() => void submit()}
        placeholder="Ask anything about your organization — data, status, next steps."
        suggestions={[
          "What changed this week?",
          "How many published forms do we have?",
          "Show upcoming events this month"
        ]}
        value={value}
      />
      {open && (turns.length > 0 || streaming) ? (
        <div className="mt-3 flex flex-col gap-2">
          <InlineThread messages={turns} onAction={() => {}} running={running} streamingText={streaming} />
          <div className="flex items-center justify-end gap-2">
            {turns.length > 0 ? (
              <Button onClick={clear} size="sm" type="button" variant="ghost">
                Clear
              </Button>
            ) : null}
            <Button onClick={() => setOpen(false)} size="sm" type="button" variant="ghost">
              Hide
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
