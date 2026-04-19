"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { AiProposal } from "@/src/features/ai/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SseEvent = {
  event: string;
  data: unknown;
};

type WorkspaceCopilotScope = {
  view?: string;
  entityType?: "organization" | "import_run" | "import_conflict";
  entityIds?: string[];
  importRunId?: string;
};

type WorkspaceCopilotContextValue = {
  messages: ChatMessage[];
  assistantDraft: string;
  composer: string;
  busy: boolean;
  latestError: string | null;
  latestProposal: AiProposal | null;
  latestProposalId: string | null;
  latestExecutionSummary: string | null;
  setComposer: (value: string) => void;
  submitPrompt: () => Promise<void>;
  confirmProposal: () => Promise<void>;
  cancelProposal: () => Promise<void>;
  setWorkspaceScope: (scope: WorkspaceCopilotScope | null) => void;
};

const WorkspaceCopilotContext = createContext<WorkspaceCopilotContextValue | null>(null);

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) {
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const payloadText = dataLines.join("\n");
    let payload: unknown = payloadText;
    try {
      payload = payloadText ? JSON.parse(payloadText) : {};
    } catch {
      payload = payloadText;
    }

    events.push({
      event: eventName,
      data: payload,
    });
  }

  return {
    events,
    rest,
  };
}

export function WorkspaceCopilotProvider({ children, orgSlug }: { children: React.ReactNode; orgSlug: string }) {
  const pathname = usePathname();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [latestProposal, setLatestProposal] = useState<AiProposal | null>(null);
  const [latestProposalId, setLatestProposalId] = useState<string | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [latestExecutionSummary, setLatestExecutionSummary] = useState<string | null>(null);
  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceCopilotScope | null>(null);

  const history = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages]
  );

  async function runAiRequest(input: { phase: "plan" | "confirm" | "cancel"; userMessage: string; proposalId?: string }) {
    setBusy(true);
    setLatestError(null);
    if (input.phase === "plan") {
      setAssistantDraft("");
    }

    const isWorkspaceRoute = pathname === `/${orgSlug}/workspace` || pathname.startsWith(`/${orgSlug}/workspace/`);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orgSlug,
          mode: isWorkspaceRoute ? "act" : "ask",
          phase: input.phase,
          proposalId: input.proposalId,
          userMessage: input.userMessage,
          conversation: history,
          uiContext: {
            source: "workspace",
            requestedAt: new Date().toISOString(),
            route: {
              pathname,
            },
            page: {
              currentModule: isWorkspaceRoute ? "workspace" : "unknown",
              tool: isWorkspaceRoute ? "workspace" : "manage",
              orgSlugFromPath: orgSlug,
            },
            workspaceContext:
              isWorkspaceRoute && workspaceScope
                ? {
                    view: workspaceScope.view,
                    entityType: workspaceScope.entityType,
                    entityIds: workspaceScope.entityIds,
                    importRunId: workspaceScope.importRunId,
                  }
                : undefined,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("AI request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffered += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffered);
        buffered = parsed.rest;

        for (const entry of parsed.events) {
          if (entry.event === "assistant.delta") {
            const payload = asObject(entry.data);
            const text = typeof payload.text === "string" ? payload.text : "";
            if (text) {
              setAssistantDraft((current) => `${current}${text}`);
            }
            continue;
          }

          if (entry.event === "assistant.done") {
            const payload = asObject(entry.data);
            const text = typeof payload.text === "string" ? payload.text.trim() : "";
            if (text) {
              setMessages((current) => [...current, { role: "assistant", content: text }]);
              setAssistantDraft("");
            }
            continue;
          }

          if (entry.event === "proposal.ready") {
            const payload = asObject(entry.data);
            const proposal = asObject(payload.proposal) as unknown as AiProposal;
            const proposalId = typeof payload.proposalId === "string" ? payload.proposalId : null;
            setLatestProposal(proposal);
            setLatestProposalId(proposalId);
            continue;
          }

          if (entry.event === "execution.result") {
            const payload = asObject(entry.data);
            const result = asObject(payload.result);
            const summary = typeof result.summary === "string" ? result.summary : "Action executed.";
            setLatestExecutionSummary(summary);
            window.dispatchEvent(new CustomEvent("workspace-copilot:execution-result"));
            continue;
          }

          if (entry.event === "error") {
            const payload = asObject(entry.data);
            const message = typeof payload.message === "string" ? payload.message : "AI request failed.";
            setLatestError(message);
          }
        }
      }
    } catch (error) {
      setLatestError(error instanceof Error ? error.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrompt() {
    const prompt = composer.trim();
    if (!prompt || busy) {
      return;
    }

    setMessages((current) => [...current, { role: "user", content: prompt }]);
    setComposer("");
    await runAiRequest({
      phase: "plan",
      userMessage: prompt,
    });
  }

  async function confirmProposal() {
    if (!latestProposalId || busy) {
      return;
    }

    await runAiRequest({
      phase: "confirm",
      proposalId: latestProposalId,
      userMessage: "Confirm and execute the proposed action.",
    });
  }

  async function cancelProposal() {
    if (!latestProposalId || busy) {
      return;
    }

    await runAiRequest({
      phase: "cancel",
      proposalId: latestProposalId,
      userMessage: "Cancel this proposal.",
    });
  }

  return (
    <WorkspaceCopilotContext.Provider
      value={{
        messages,
        assistantDraft,
        composer,
        busy,
        latestError,
        latestProposal,
        latestProposalId,
        latestExecutionSummary,
        setComposer,
        submitPrompt,
        confirmProposal,
        cancelProposal,
        setWorkspaceScope,
      }}
    >
      {children}
    </WorkspaceCopilotContext.Provider>
  );
}

export function useWorkspaceCopilot() {
  const context = useContext(WorkspaceCopilotContext);
  if (!context) {
    throw new Error("useWorkspaceCopilot must be used within WorkspaceCopilotProvider");
  }
  return context;
}
