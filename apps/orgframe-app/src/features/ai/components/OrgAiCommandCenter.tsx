"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Bot, Send, Sparkles } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import { cn } from "@orgframe/ui/primitives/utils";
import type { AiConversationMessage } from "@/src/features/ai/types";

type OrgOption = {
  orgSlug: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgIconUrl?: string | null;
};

type ChatRole = "user" | "assistant";

type WorkspaceMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type DirectRouteIntent = {
  href: string;
  label: string;
  prefill: string | null;
};

type AiRunResult = {
  assistantText: string;
  errorMessage: string | null;
};

type CommandPopoverState =
  | {
      kind: "answer";
      title: string;
      message: string;
      primaryLabel?: string;
      secondaryLabel?: string;
      primaryAction?: "open_workspace" | "dismiss";
    }
  | {
      kind: "preview";
      title: string;
      message: string;
      actionLabel: string;
      actionHref: string;
    }
  | {
      kind: "suggestions";
      title: string;
      options: string[];
    }
  | {
      kind: "error";
      title: string;
      message: string;
      actionLabel?: string;
      action?: "open_workspace" | "dismiss";
    };

type OrgAiCommandCenterProps = {
  initialOrgSlug?: string | null;
  orgOptions: OrgOption[];
  disabled?: boolean;
};

function createMessageId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function inferPrefillText(prompt: string) {
  const match = prompt.match(/(?:for|named|called)\s+["']?([^"'.,!?]{2,80})/i);
  if (!match) {
    return null;
  }

  return normalizeSpace(match[1] ?? "") || null;
}

function inferDirectRouteIntent(orgSlug: string, prompt: string): DirectRouteIntent | null {
  const text = prompt.toLowerCase();
  const asksForAction = /(create|new|add|open|go to|navigate|take me|launch|start)/.test(text);

  if (!asksForAction) {
    return null;
  }

  const prefill = inferPrefillText(prompt);

  if (/program/.test(text)) {
    return {
      href: `/${orgSlug}/tools/programs${prefill ? `?ai_prefill=${encodeURIComponent(prefill)}` : ""}`,
      label: "Programs",
      prefill
    };
  }

  if (/form|registration/.test(text)) {
    return {
      href: `/${orgSlug}/tools/forms${prefill ? `?ai_prefill=${encodeURIComponent(prefill)}` : ""}`,
      label: "Forms",
      prefill
    };
  }

  if (/inbox|message|communication/.test(text)) {
    return {
      href: `/${orgSlug}/tools/inbox`,
      label: "Inbox",
      prefill: null
    };
  }

  if (/calendar|schedule/.test(text)) {
    return {
      href: `/${orgSlug}/tools/calendar${prefill ? `?ai_prefill=${encodeURIComponent(prefill)}` : ""}`,
      label: "Calendar",
      prefill
    };
  }

  if (/facilit|field|court|venue/.test(text)) {
    return {
      href: `/${orgSlug}/tools/facilities${prefill ? `?ai_prefill=${encodeURIComponent(prefill)}` : ""}`,
      label: "Facilities",
      prefill
    };
  }

  if (/site|page|website/.test(text)) {
    return {
      href: `/${orgSlug}/tools/site${prefill ? `?ai_prefill=${encodeURIComponent(prefill)}` : ""}`,
      label: "Site",
      prefill
    };
  }

  if (/access|member|permission/.test(text)) {
    return {
      href: `/${orgSlug}/tools/access`,
      label: "Access",
      prefill: null
    };
  }

  return null;
}

function shouldOpenWorkspace(prompt: string, assistantText: string) {
  if (prompt.length > 130) {
    return true;
  }

  if (assistantText.length > 280) {
    return true;
  }

  return /(analy[sz]e|trend|forecast|strategy|report|recommend|improve|plan|compare|multi[- ]turn|deeper)/i.test(prompt);
}

function shouldUsePreviewPopover(prompt: string) {
  return /(show|open|view|edit).{0,40}(detail|profile|info|information|contact)/i.test(prompt);
}

function getRelatedWorkspaceHref(orgSlug: string | null, prompt: string) {
  const targetPrompt = prompt.toLowerCase();

  if (/player/.test(targetPrompt)) {
    return "/account/players";
  }
  if (/program/.test(targetPrompt)) {
    return `/${orgSlug}/tools/programs`;
  }
  if (/form|registration/.test(targetPrompt)) {
    return orgSlug ? `/${orgSlug}/tools/forms` : "/account";
  }

  return orgSlug ? `/${orgSlug}/tools/inbox` : "/account";
}

function buildCommandSuggestions(value: string) {
  const text = value.toLowerCase().trim();
  if (text.length < 2) {
    return [];
  }

  if (text.includes("schedule")) {
    return ["Schedule a new game", "View upcoming schedule", "Reschedule a practice"];
  }
  if (text.includes("program")) {
    return ["Create a new program", "Open programs workspace", "Publish a program"];
  }
  if (text.includes("player")) {
    return ["Show player profile", "Add player to team", "View active players"];
  }
  if (text.includes("form")) {
    return ["Create registration form", "Open forms workspace", "View form submissions"];
  }

  return ["Open programs workspace", "Open forms workspace", "View inbox", "Open calendar workspace"];
}

function toConversation(messages: WorkspaceMessage[]): AiConversationMessage[] {
  return messages.slice(-12).map((message) => ({
    role: message.role,
    content: message.content
  }));
}

async function runAiRequest({
  orgSlug,
  userMessage,
  conversation
}: {
  orgSlug?: string | null;
  userMessage: string;
  conversation: AiConversationMessage[];
}): Promise<AiRunResult> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      orgSlug: orgSlug ?? undefined,
      mode: "ask",
      phase: "plan",
      userMessage,
      conversation
    })
  });

  if (!response.ok) {
    return {
      assistantText: "",
      errorMessage: "The assistant is unavailable right now."
    };
  }

  if (!response.body) {
    return {
      assistantText: "",
      errorMessage: "The assistant response stream did not start."
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let assistantText = "";
  let doneText = "";
  let errorMessage: string | null = null;

  const parseEventBlock = (block: string) => {
    const lines = block.split("\n");
    let eventName = "";
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

    if (!eventName || dataLines.length === 0) {
      return;
    }

    const rawData = dataLines.join("\n");
    let payload: { text?: string; message?: string };
    try {
      payload = JSON.parse(rawData) as { text?: string; message?: string };
    } catch {
      throw new Error("Received an invalid assistant stream payload.");
    }

    if (eventName === "assistant.delta" && typeof payload.text === "string") {
      assistantText += payload.text;
      return;
    }

    if (eventName === "assistant.done" && typeof payload.text === "string") {
      doneText = payload.text;
      return;
    }

    if (eventName === "error") {
      errorMessage = typeof payload.message === "string" ? payload.message : "The assistant could not process this request.";
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let markerIndex = buffer.indexOf("\n\n");
      while (markerIndex !== -1) {
        const eventBlock = buffer.slice(0, markerIndex).trim();
        buffer = buffer.slice(markerIndex + 2);

        if (eventBlock) {
          parseEventBlock(eventBlock);
        }

        markerIndex = buffer.indexOf("\n\n");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant stream was interrupted.";
    return {
      assistantText: doneText || assistantText,
      errorMessage: message
    };
  }

  if (buffer.trim()) {
    parseEventBlock(buffer.trim());
  }

  return {
    assistantText: doneText || assistantText,
    errorMessage
  };
}

export function OrgAiCommandCenter({ initialOrgSlug = null, orgOptions, disabled = false }: OrgAiCommandCenterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const commandBarRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);

  const [commandValue, setCommandValue] = useState("");
  const [workspaceValue, setWorkspaceValue] = useState("");
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [isWorkspaceRunning, setIsWorkspaceRunning] = useState(false);
  const [workspaceMessages, setWorkspaceMessages] = useState<WorkspaceMessage[]>([]);
  const [commandPopover, setCommandPopover] = useState<CommandPopoverState | null>(null);
  const [isCommandInputFocused, setIsCommandInputFocused] = useState(false);

  const activePathOrgSlug = useMemo(() => {
    const firstSegment = pathname.split("/").filter(Boolean)[0] ?? null;
    if (!firstSegment) {
      return null;
    }
    return orgOptions.some((option) => option.orgSlug === firstSegment) ? firstSegment : null;
  }, [orgOptions, pathname]);

  const activeOrg = useMemo(() => {
    if (activePathOrgSlug) {
      return orgOptions.find((option) => option.orgSlug === activePathOrgSlug) ?? null;
    }
    if (initialOrgSlug) {
      return orgOptions.find((option) => option.orgSlug === initialOrgSlug) ?? null;
    }
    return orgOptions[0] ?? null;
  }, [activePathOrgSlug, initialOrgSlug, orgOptions]);

  const activeOrgSlug = activeOrg?.orgSlug ?? null;
  const resolvedOrgSlug = activeOrgSlug ?? initialOrgSlug ?? null;
  const activeOrgName = activeOrg?.orgName ?? "Organization";
  const activeOrgContextLabel = resolvedOrgSlug ? `${activeOrgName} (${resolvedOrgSlug})` : "Account context";

  const appendWorkspaceMessage = useCallback((role: ChatRole, content: string) => {
    const normalized = normalizeSpace(content);
    if (!normalized) {
      return;
    }

    setWorkspaceMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role,
        content: normalized,
        createdAt: Date.now()
      }
    ]);
  }, []);

  const runAndHandleAssistant = useCallback(
    async ({ userMessage, conversation, source }: { userMessage: string; conversation: AiConversationMessage[]; source: "command" | "workspace" }) => {
      const result = await runAiRequest({
        orgSlug: resolvedOrgSlug,
        userMessage,
        conversation
      }).catch((error) => ({
        assistantText: "",
        errorMessage: error instanceof Error ? error.message : "The assistant request failed to complete."
      }));

      const assistantReply = normalizeSpace(result.assistantText);

      if (result.errorMessage) {
        setCommandPopover({
          kind: "error",
          title: "Assistant error",
          message: result.errorMessage,
          action: "open_workspace",
          actionLabel: "Open AI Workspace"
        });
      }

      if (!assistantReply) {
        return;
      }

      if (source === "workspace") {
        appendWorkspaceMessage("assistant", assistantReply);
        return;
      }

      if (shouldOpenWorkspace(userMessage, assistantReply)) {
        appendWorkspaceMessage("user", userMessage);
        appendWorkspaceMessage("assistant", assistantReply);
        setCommandPopover(null);
        setIsWorkspaceOpen(true);
        return;
      }

      if (shouldUsePreviewPopover(userMessage)) {
        setCommandPopover({
          kind: "preview",
          title: "Quick preview",
          message: assistantReply,
          actionLabel: "View Full Profile",
          actionHref: getRelatedWorkspaceHref(resolvedOrgSlug, userMessage)
        });
        return;
      }

      const looksLikeConfirmation = /are you sure|cannot be undone|confirm/i.test(assistantReply);
      setCommandPopover({
        kind: "answer",
        title: looksLikeConfirmation ? "Please confirm" : "Assistant response",
        message: assistantReply,
        primaryLabel: looksLikeConfirmation ? "Confirm" : "Open AI Workspace",
        secondaryLabel: looksLikeConfirmation ? "Cancel" : "Dismiss",
        primaryAction: looksLikeConfirmation ? "open_workspace" : "open_workspace"
      });
    },
    [appendWorkspaceMessage, resolvedOrgSlug]
  );

  const submitCommand = useCallback(async () => {
    const prompt = normalizeSpace(commandValue);
    if (!prompt || isCommandRunning || disabled) {
      return;
    }

    setCommandValue("");
    setCommandPopover(null);

    if (resolvedOrgSlug) {
      const directIntent = inferDirectRouteIntent(resolvedOrgSlug, prompt);
      if (directIntent) {
        router.push(directIntent.href);
        setCommandPopover({
          kind: "answer",
          title: "Command handled",
          message: directIntent.prefill ? `Opened ${directIntent.label} with "${directIntent.prefill}".` : `Opened ${directIntent.label}.`,
          primaryLabel: "Dismiss",
          primaryAction: "dismiss"
        });
        return;
      }
    }

    setIsCommandRunning(true);
    try {
      await runAndHandleAssistant({
        userMessage: prompt,
        conversation: toConversation(workspaceMessages),
        source: "command"
      });
    } finally {
      setIsCommandRunning(false);
    }
  }, [commandValue, disabled, isCommandRunning, resolvedOrgSlug, router, runAndHandleAssistant, workspaceMessages]);

  const submitWorkspaceMessage = useCallback(async () => {
    const prompt = normalizeSpace(workspaceValue);
    if (!prompt || isWorkspaceRunning || disabled) {
      return;
    }

    setWorkspaceValue("");
    appendWorkspaceMessage("user", prompt);
    setIsWorkspaceRunning(true);

    try {
      const nextConversation = [...workspaceMessages, { id: createMessageId(), role: "user" as const, content: prompt, createdAt: Date.now() }];
      await runAndHandleAssistant({
        userMessage: prompt,
        conversation: toConversation(nextConversation),
        source: "workspace"
      });
    } finally {
      setIsWorkspaceRunning(false);
    }
  }, [appendWorkspaceMessage, disabled, isWorkspaceRunning, resolvedOrgSlug, runAndHandleAssistant, workspaceMessages, workspaceValue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCommandPopover(null);
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      commandInputRef.current?.focus();
      commandInputRef.current?.select();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isWorkspaceOpen) {
      return;
    }

    workspaceScrollRef.current?.scrollTo({
      top: workspaceScrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [isWorkspaceOpen, workspaceMessages]);

  useEffect(() => {
    if (!isCommandInputFocused || disabled || isCommandRunning || isWorkspaceOpen) {
      return;
    }

    const suggestions = buildCommandSuggestions(commandValue);
    if (suggestions.length === 0) {
      return;
    }

    setCommandPopover({
      kind: "suggestions",
      title: "Suggestions",
      options: suggestions
    });
  }, [commandValue, disabled, isCommandInputFocused, isCommandRunning, isWorkspaceOpen]);

  useEffect(() => {
    if (!commandPopover) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!commandBarRef.current) {
        return;
      }

      if (!commandBarRef.current.contains(event.target as Node)) {
        setCommandPopover(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [commandPopover]);

  const openWorkspaceFromPopover = useCallback(() => {
    if (commandValue.trim()) {
      appendWorkspaceMessage("user", commandValue.trim());
    }
    setCommandPopover(null);
    setIsWorkspaceOpen(true);
  }, [appendWorkspaceMessage, commandValue]);

  return (
    <>
      <div className="relative min-w-0 w-full max-w-[22rem]" ref={commandBarRef}>
        <form
          className="flex min-w-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCommand();
          }}
        >
          <label className="sr-only" htmlFor="org-ai-command-input">
            Ask the assistant
          </label>
          <div className="relative min-w-0 flex-1">
            <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              className="h-9 bg-surface pl-9 pr-12"
              disabled={disabled || isCommandRunning}
              id="org-ai-command-input"
              onBlur={(event) => {
                setIsCommandInputFocused(false);
                requestAnimationFrame(() => {
                  const nextTarget = (document.activeElement as Node | null) ?? (event.relatedTarget as Node | null);
                  if (!nextTarget || !commandBarRef.current?.contains(nextTarget)) {
                    setCommandPopover(null);
                  }
                });
              }}
              onChange={(event) => {
                setCommandValue(event.target.value);
                setCommandPopover(null);
              }}
              onFocus={() => setIsCommandInputFocused(true)}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              placeholder={resolvedOrgSlug ? "Ask OrgAI" : "Ask OrgAI about your account"}
              ref={commandInputRef}
              value={commandValue}
            />
            <Button
              className="absolute right-1.5 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full p-0"
              disabled={!normalizeSpace(commandValue)}
              loading={isCommandRunning}
              size="sm"
              type="submit"
              variant="secondary"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
        {commandPopover ? (
          <div className="absolute left-0 top-[calc(100%+0.45rem)] z-[260] w-[min(92vw,28rem)] overflow-hidden rounded-card border bg-surface shadow-floating">
            <div className="max-h-72 space-y-3 overflow-y-auto p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{commandPopover.title}</p>

              {commandPopover.kind === "suggestions" ? (
                <div className="space-y-1.5">
                  {commandPopover.options.map((option) => (
                    <button
                      className="block w-full rounded-control border border-border/70 bg-surface-muted/35 px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted"
                      key={option}
                      onMouseDown={(event) => {
                        // Prevent input blur from collapsing the popover before click executes.
                        event.preventDefault();
                      }}
                      onClick={() => {
                        if (resolvedOrgSlug) {
                          const directIntent = inferDirectRouteIntent(resolvedOrgSlug, option);
                          if (directIntent) {
                            setCommandPopover(null);
                            setCommandValue("");
                            router.push(directIntent.href);
                            return;
                          }
                        }
                        setCommandValue(option);
                        setCommandPopover(null);
                        commandInputRef.current?.focus();
                      }}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}

              {commandPopover.kind === "answer" || commandPopover.kind === "preview" || commandPopover.kind === "error" ? (
                <p className="whitespace-pre-wrap text-sm text-text">{commandPopover.message}</p>
              ) : null}

              {commandPopover.kind === "preview" ? (
                <Button
                  onClick={() => {
                    setCommandPopover(null);
                    router.push(commandPopover.actionHref);
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {commandPopover.actionLabel}
                </Button>
              ) : null}

              {commandPopover.kind === "answer" ? (
                <div className="flex items-center gap-2">
                  {commandPopover.primaryLabel ? (
                    <Button
                      onClick={() => {
                        if (commandPopover.primaryAction === "open_workspace") {
                          openWorkspaceFromPopover();
                          return;
                        }
                        setCommandPopover(null);
                      }}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {commandPopover.primaryLabel}
                    </Button>
                  ) : null}
                  {commandPopover.secondaryLabel ? (
                    <Button onClick={() => setCommandPopover(null)} size="sm" type="button" variant="ghost">
                      {commandPopover.secondaryLabel}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {commandPopover.kind === "error" && commandPopover.actionLabel ? (
                <Button
                  onClick={() => {
                    if (commandPopover.action === "open_workspace") {
                      openWorkspaceFromPopover();
                      return;
                    }
                    setCommandPopover(null);
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {commandPopover.actionLabel}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <Panel
        contentClassName="space-y-3"
        footer={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitWorkspaceMessage();
            }}
          >
            <label className="sr-only" htmlFor="org-ai-workspace-input">
              Continue AI conversation
            </label>
            <Input
              className="h-10"
              disabled={disabled || isWorkspaceRunning}
              id="org-ai-workspace-input"
              onChange={(event) => setWorkspaceValue(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              placeholder={resolvedOrgSlug ? `Continue conversation for ${activeOrgContextLabel}...` : "Continue conversation for your account..."}
              value={workspaceValue}
            />
            <Button disabled={!normalizeSpace(workspaceValue)} loading={isWorkspaceRunning} size="sm" type="submit">
              <Send className="h-4 w-4" />
              Send
            </Button>
          </form>
        }
        onClose={() => setIsWorkspaceOpen(false)}
        open={isWorkspaceOpen}
        globalPanel
        panelClassName="rounded-none border-y-0 border-r-0 max-w-[min(100vw,460px)] !w-[min(100vw,460px)]"
        pushMode="app"
        subtitle="Persistent AI conversation for deeper planning and analysis."
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Workspace
          </span>
        }
      >
        <div className="flex h-full min-h-[55vh] flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{activeOrgContextLabel}</div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" ref={workspaceScrollRef}>
            {workspaceMessages.length === 0 ? (
              <div className="rounded-control border border-dashed bg-surface-muted/35 p-3 text-sm text-text-muted">
                Start in the command bar, or continue here for multi-turn analysis and execution planning.
              </div>
            ) : null}

            {workspaceMessages.map((message) => (
              <article
                className={cn(
                  "max-w-[94%] rounded-control border px-3 py-2 text-sm",
                  message.role === "assistant"
                    ? "mr-auto border-border bg-surface text-text"
                    : "ml-auto border-accent/35 bg-accent/10 text-text"
                )}
                key={message.id}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </article>
            ))}

            {isWorkspaceRunning ? (
              <div className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text-muted">
                <SpinnerIcon className="h-4 w-4" />
                Assistant is working...
              </div>
            ) : null}
          </div>

          {workspaceMessages.length > 0 ? (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{workspaceMessages.length} messages</span>
              <button
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                onClick={() => setWorkspaceMessages([])}
                type="button"
              >
                <span>Clear</span>
              </button>
            </div>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
