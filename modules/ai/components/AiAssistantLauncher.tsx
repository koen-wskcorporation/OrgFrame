"use client";

import { Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesWarning } from "@/modules/site-builder/hooks/useUnsavedChangesWarning";
import { cn } from "@/lib/utils";
import type { AiConversationMessage, AiMode, AiProposal, AiSseEventMap, AiSseEventName } from "@/modules/ai/types";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type PendingProposal = {
  proposalId: string | null;
  proposal: AiProposal;
};

type AiAssistantLauncherProps = {
  orgSlug?: string;
  askOnly?: boolean;
  canAct?: boolean;
  buttonLabel?: string;
  buttonVariant?: "primary" | "secondary" | "ghost";
  buttonSize?: "sm" | "md" | "lg";
  className?: string;
  suggestions?: string[];
};

const defaultSuggestions = ["Create form draft", "Approve form response", "Update form status", "Set governing body"];

function mapErrorMessage(code: string, message: string) {
  switch (code) {
    case "missing_openai_api_key":
      return "Server configuration is missing OPENAI_API_KEY.";
    case "insufficient_permissions":
      return "You can ask questions, but cannot run org actions with current permissions.";
    case "rate_limited":
      return message;
    case "proposal_expired":
      return "This proposal expired. Submit the request again to create a fresh proposal.";
    case "org_not_found":
      return "Organization context could not be loaded.";
    default:
      return message;
  }
}

function parseSseChunk(chunk: string) {
  const lines = chunk.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }

    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!data) {
    return null;
  }

  try {
    return {
      event: event as AiSseEventName,
      payload: JSON.parse(data) as AiSseEventMap[AiSseEventName]
    } as { [K in AiSseEventName]: { event: K; payload: AiSseEventMap[K] } }[AiSseEventName];
  } catch {
    return null;
  }
}

export function AiAssistantLauncher({
  orgSlug,
  askOnly = false,
  canAct = false,
  buttonLabel = "AI Assistant",
  buttonVariant = "secondary",
  buttonSize = "sm",
  className,
  suggestions = defaultSuggestions
}: AiAssistantLauncherProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AiMode>("ask");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [entitySelections, setEntitySelections] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const messageCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveMode: AiMode = askOnly ? "ask" : mode;
  const allowAct = !askOnly && canAct;

  useUnsavedChangesWarning({
    enabled: Boolean(pendingProposal?.proposal.executable)
  });

  const conversation = useMemo<AiConversationMessage[]>(() => {
    return messages.slice(-12).map((message) => ({
      role: message.role,
      content: message.content
    }));
  }, [messages]);

  function nextMessageId(prefix: string) {
    messageCounterRef.current += 1;
    return `${prefix}-${messageCounterRef.current}`;
  }

  function upsertAssistantMessage(messageId: string, text: string) {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === messageId);

      if (index === -1) {
        return [...current, { id: messageId, role: "assistant", content: text }];
      }

      const next = [...current];
      next[index] = {
        ...next[index],
        content: text
      };
      return next;
    });
  }

  async function streamRequest(payload: {
    userMessage: string;
    mode: AiMode;
    phase?: "plan" | "confirm" | "cancel";
    proposalId?: string;
    conversation: AiConversationMessage[];
    entitySelectionsOverride?: Record<string, string>;
  }) {
    setIsStreaming(true);
    setErrorMessage(null);

    const assistantMessageId = nextMessageId("assistant");
    let assistantBuffer = "";

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orgSlug,
          userMessage: payload.userMessage,
          mode: payload.mode,
          phase: payload.phase ?? "plan",
          proposalId: payload.proposalId,
          conversation: payload.conversation,
          entitySelections: payload.entitySelectionsOverride ?? entitySelections
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("Unable to reach AI endpoint.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary === -1) {
            break;
          }

          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseChunk(rawEvent);

          if (!parsed) {
            continue;
          }

          if (parsed.event === "assistant.delta") {
            assistantBuffer += parsed.payload.text;
            upsertAssistantMessage(assistantMessageId, assistantBuffer);
            continue;
          }

          if (parsed.event === "assistant.done") {
            const finalText = parsed.payload.text || assistantBuffer;
            if (finalText) {
              upsertAssistantMessage(assistantMessageId, finalText);
            }
            continue;
          }

          if (parsed.event === "proposal.ready") {
            setPendingProposal({
              proposalId: parsed.payload.proposalId,
              proposal: parsed.payload.proposal
            });
            continue;
          }

          if (parsed.event === "execution.result") {
            if (parsed.payload.result.ok) {
              setPendingProposal(null);
            }
            continue;
          }

          if (parsed.event === "error") {
            setErrorMessage(mapErrorMessage(parsed.payload.code, parsed.payload.message));
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected AI request failure.";
      setErrorMessage(message);
    } finally {
      setIsStreaming(false);
    }
  }

  async function submitPrompt(rawText: string) {
    const text = rawText.trim();
    if (!text || isStreaming) {
      return;
    }

    setLastUserMessage(text);
    setInput("");

    const userMessage = {
      id: nextMessageId("user"),
      role: "user" as const,
      content: text
    };

    setMessages((current) => [...current, userMessage]);

    await streamRequest({
      userMessage: text,
      mode: effectiveMode,
      phase: "plan",
      conversation: [...conversation, { role: "user" as const, content: text }].slice(-12)
    });
  }

  async function confirmProposal() {
    if (!pendingProposal?.proposalId || isStreaming) {
      return;
    }

    await streamRequest({
      userMessage: lastUserMessage || "Confirm proposed action",
      mode: "act",
      phase: "confirm",
      proposalId: pendingProposal.proposalId,
      conversation
    });
  }

  async function cancelProposal() {
    if (!pendingProposal?.proposalId || isStreaming) {
      setPendingProposal(null);
      return;
    }

    await streamRequest({
      userMessage: lastUserMessage || "Cancel proposed action",
      mode: "act",
      phase: "cancel",
      proposalId: pendingProposal.proposalId,
      conversation
    });

    setPendingProposal(null);
  }

  async function resolveAmbiguity(selectionKey: string, candidateKey: string) {
    const nextSelections = {
      ...entitySelections,
      [selectionKey]: candidateKey
    };
    setEntitySelections(nextSelections);

    if (!lastUserMessage) {
      return;
    }

    await streamRequest({
      userMessage: lastUserMessage,
      mode: "act",
      phase: "plan",
      conversation,
      entitySelectionsOverride: nextSelections
    });
  }

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)} size={buttonSize} type="button" variant={buttonVariant}>
        <Sparkles className="h-4 w-4" />
        {buttonLabel}
      </Button>

      <Panel
        contentClassName="flex flex-col gap-4"
        footer={
          <div className="flex w-full items-center gap-2">
            <Textarea
              className="min-h-[90px] flex-1"
              disabled={isStreaming}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submitPrompt(input);
                }
              }}
              placeholder={effectiveMode === "ask" ? "Ask about your data or workflows..." : "Describe the admin action to plan..."}
              ref={textareaRef}
              value={input}
            />
            <Button disabled={isStreaming || !input.trim()} onClick={() => void submitPrompt(input)} size="sm" variant="primary">
              {isStreaming ? "Thinking..." : "Send"}
            </Button>
          </div>
        }
        onClose={() => setOpen(false)}
        open={open}
        subtitle={orgSlug ? `Context: ${orgSlug}` : "Global dashboard context"}
        title="AI Assistant"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-control border bg-surface-muted p-1">
              <button
                className={cn("rounded-control px-3 py-1 text-xs font-semibold", effectiveMode === "ask" ? "bg-surface text-text" : "text-text-muted")}
                onClick={() => setMode("ask")}
                type="button"
              >
                Ask
              </button>
              <button
                className={cn("rounded-control px-3 py-1 text-xs font-semibold", effectiveMode === "act" ? "bg-surface text-text" : "text-text-muted")}
                disabled={!allowAct}
                onClick={() => setMode("act")}
                type="button"
              >
                Act
              </button>
            </div>
            {!allowAct ? <Chip color="yellow">Act mode unavailable</Chip> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                onClick={() => {
                  setInput(suggestion);
                  textareaRef.current?.focus();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>

        {pendingProposal ? (
          <div className="space-y-3 rounded-card border bg-surface-muted p-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Proposed Changes</p>
              <p className="text-sm font-semibold text-text">{pendingProposal.proposal.summary}</p>
            </div>

            <div className="space-y-2">
              {pendingProposal.proposal.steps.map((step) => (
                <div className="rounded-control border bg-surface px-3 py-2" key={step.key}>
                  <p className="text-xs font-semibold text-text">{step.title}</p>
                  <p className="text-xs text-text-muted">{step.detail}</p>
                </div>
              ))}
            </div>

            {pendingProposal.proposal.ambiguity ? (
              <div className="space-y-2 rounded-control border border-amber-500/50 bg-amber-500/10 p-2">
                <p className="text-xs font-semibold text-text">{pendingProposal.proposal.ambiguity.title}</p>
                <p className="text-xs text-text-muted">{pendingProposal.proposal.ambiguity.description}</p>
                <div className="flex flex-wrap gap-2">
                  {pendingProposal.proposal.ambiguity.candidates.map((candidate) => (
                    <Button
                      key={candidate.key}
                      onClick={() => void resolveAmbiguity(pendingProposal.proposal.ambiguity?.key ?? "", candidate.key)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {candidate.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {pendingProposal.proposal.warnings.length > 0 ? (
              <div className="space-y-1">
                {pendingProposal.proposal.warnings.map((warning) => (
                  <p className="text-xs text-amber-700" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button disabled={isStreaming || !pendingProposal.proposal.executable || !pendingProposal.proposalId} onClick={() => void confirmProposal()} size="sm" variant="primary">
                Confirm & Run
              </Button>
              <Button disabled={isStreaming} onClick={() => void cancelProposal()} size="sm" variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={isStreaming}
                onClick={() => {
                  setInput(lastUserMessage);
                  setPendingProposal(null);
                  textareaRef.current?.focus();
                }}
                size="sm"
                variant="ghost"
              >
                Edit request
              </Button>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{errorMessage}</div>
        ) : null}

        <div className="space-y-2">
          {messages.map((message) => (
            <div
              className={cn(
                "rounded-control border px-3 py-2 text-sm",
                message.role === "user" ? "ml-6 bg-surface-muted" : "mr-6 bg-surface"
              )}
              key={message.id}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{message.role}</p>
              <p className="whitespace-pre-wrap text-sm text-text">{message.content}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
