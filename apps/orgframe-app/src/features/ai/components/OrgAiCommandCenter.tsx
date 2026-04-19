"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Panel } from "@orgframe/ui/primitives/panel";
import { AiComposer } from "@/src/features/ai/components/AiComposer";
import { InlineThread } from "@/src/features/ai/components/InlineThread";
import { nextCommandSurfaceState, trimConversation, type CommandSurfaceState, type CommandTurn } from "@/src/features/ai/components/command-surface";
import type { AiConversationMessage, AiResultCard, AiSuggestedAction, AiUiContext } from "@/src/features/ai/types";

type OrgOption = {
  orgSlug: string;
  orgName: string;
  orgLogoUrl?: string | null;
  orgIconUrl?: string | null;
};

type ThreadState = {
  threadId: string;
  turns: CommandTurn[];
};

type OrgAiCommandCenterProps = {
  initialOrgSlug?: string | null;
  orgOptions: OrgOption[];
  disabled?: boolean;
};

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toConversation(turns: CommandTurn[]): AiConversationMessage[] {
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

function cleanText(value: string | null | undefined, max = 120) {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeSpace(value);
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, max);
}

type UiScopeModule = NonNullable<AiUiContext["page"]["currentModule"]>;

function inferModuleFromPath(pathname: string): UiScopeModule {
  const segments = pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return "unknown";
  }

  let scopedSegments = segments;
  if (segments[0] !== "manage" && segments[0] !== "tools" && segments[0] !== "account" && segments.length > 1) {
    scopedSegments = segments.slice(1);
  }

  const [root] = scopedSegments;
  if (root === "manage" || root === "tools") {
    const module = scopedSegments[1];
    if (module === "calendar" || module === "events") return "calendar";
    if (module === "facilities") return "facilities";
    if (module === "programs") return "programs";
    if (module === "inbox") return "communications";
    if (module === "files") return "files";
    return "unknown";
  }

  if (root === "calendar") return "calendar";
  if (root === "facilities") return "facilities";
  if (root === "programs" || root === "program") return "programs";
  if (root === "teams") return "teams";
  if (root === "communications" || root === "inbox") return "communications";
  if (root === "files") return "files";
  if (root === "profiles") return "profiles";
  if (root === "settings") return "settings";
  if (root === "workspace") return "workspace";

  return "unknown";
}

function buildUiContext(input: { pathname: string; orgSlug: string | null; source: AiUiContext["source"] }): AiUiContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const location = window.location;
  const selection = window.getSelection?.();
  const selectedText = cleanText(selection?.toString() ?? "", 500);
  const active = document.activeElement as HTMLElement | null;
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries());
  const segments = input.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
  const maybeOrgSlugFromPath = segments[0] && segments[0] !== "manage" && segments[0] !== "tools" && segments[0] !== "account" ? segments[0] : undefined;
  const scopedSegments = maybeOrgSlugFromPath ? segments.slice(1) : segments;
  const isManageRoute = scopedSegments[0] === "manage" || scopedSegments[0] === "tools";
  const module = isManageRoute ? scopedSegments[1] : undefined;

  let entityType: string | undefined;
  let entityId: string | undefined;
  if (module === "facilities" && scopedSegments[2]) {
    entityType = "facility";
    entityId = scopedSegments[2];
  } else if (module === "programs" && scopedSegments[2]) {
    entityType = "program";
    entityId = scopedSegments[2];
  } else if (scopedSegments[0] === "programs" && scopedSegments[1]) {
    entityType = "program";
    entityId = scopedSegments[1];
  } else if (scopedSegments[0] === "teams" && scopedSegments[1]) {
    entityType = "team";
    entityId = scopedSegments[1];
  } else if (scopedSegments[0] === "calendar" && scopedSegments[1]) {
    entityType = "occurrence";
    entityId = scopedSegments[1];
  }

  const activeElementContext =
    active && active.tagName
      ? {
          tagName: active.tagName.toLowerCase(),
          role: cleanText(active.getAttribute("role"), 40),
          id: cleanText(active.id, 80),
          name: cleanText(active.getAttribute("name"), 80),
          ariaLabel: cleanText(active.getAttribute("aria-label"), 120),
          placeholder: cleanText(active.getAttribute("placeholder"), 120),
          datasetContext: cleanText(active.getAttribute("data-context"), 120)
        }
      : undefined;

  return {
    source: input.source,
    requestedAt: new Date().toISOString(),
    route: {
      pathname: input.pathname,
      search: cleanText(location.search, 300),
      hash: cleanText(location.hash, 120),
      title: cleanText(document.title, 180),
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    },
    page: {
      currentModule: inferModuleFromPath(input.pathname),
      tool: cleanText(module, 80),
      entityType: cleanText(entityType, 80),
      entityId: cleanText(entityId, 120),
      orgSlugFromPath: cleanText(maybeOrgSlugFromPath ?? input.orgSlug ?? undefined, 80)
    },
    selection:
      selectedText || activeElementContext
        ? {
            text: selectedText,
            activeElement: activeElementContext
          }
        : undefined,
    viewport: {
      width: Math.max(1, Math.round(window.innerWidth || 0)),
      height: Math.max(1, Math.round(window.innerHeight || 0)),
      isMobile: window.matchMedia?.("(max-width: 768px)").matches ?? false
    },
    runtime: {
      timezone: cleanText(Intl.DateTimeFormat().resolvedOptions().timeZone, 80),
      language: cleanText(navigator.language, 40),
      online: typeof navigator.onLine === "boolean" ? navigator.onLine : undefined,
      visibilityState: cleanText(document.visibilityState, 40)
    }
  };
}

function buildSuggestions(value: string) {
  const text = value.toLowerCase().trim();
  if (text.length < 2) {
    return ["Show player profile", "Open account access", "Reschedule this event", "Open calendar timeline"];
  }

  if (text.includes("schedule") || text.includes("calendar")) {
    return ["Move Saturday game to Sunday", "Find schedule conflicts", "Open calendar timeline"];
  }

  if (text.includes("player")) {
    return ["Show player profile", "Link guardian access", "View active players"];
  }

  if (text.includes("account")) {
    return ["Open account details", "Show linked players", "Review guardian access"];
  }

  return ["Show player profile", "Open account access", "Reschedule this event"];
}

export function OrgAiCommandCenter({ initialOrgSlug = null, orgOptions, disabled = false }: OrgAiCommandCenterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);

  const [surfaceState, setSurfaceState] = useState<CommandSurfaceState>("idle");
  const [composerValue, setComposerValue] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInlineOpen, setIsInlineOpen] = useState(false);
  const [threadsByScope, setThreadsByScope] = useState<Record<string, ThreadState>>({});

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

  const resolvedOrgSlug = activeOrg?.orgSlug ?? initialOrgSlug ?? null;
  const activeOrgName = activeOrg?.orgName ?? "Organization";
  const scopeKey = resolvedOrgSlug ? `org:${resolvedOrgSlug}` : "account";
  const activeThread = threadsByScope[scopeKey] ?? null;
  const activeTurns = activeThread?.turns ?? [];
  const activeThreadId = activeThread?.threadId ?? null;
  const isRunning = surfaceState === "streaming";
  const suggestions = useMemo(() => buildSuggestions(composerValue), [composerValue]);

  useEffect(() => {
    setThreadsByScope((current) => {
      if (current[scopeKey]) {
        return current;
      }

      return {
        ...current,
        [scopeKey]: {
          threadId: createId(),
          turns: []
        }
      };
    });
  }, [scopeKey]);

  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }

    sidebarScrollRef.current?.scrollTo({
      top: sidebarScrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [activeTurns, isSidebarOpen, streamingText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsInlineOpen(false);
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      composerRef.current?.focus();
      setIsInlineOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isInlineOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setIsInlineOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isInlineOpen]);

  const appendTurn = useCallback((turn: CommandTurn) => {
    setThreadsByScope((current) => {
      const existing = current[scopeKey] ?? { threadId: createId(), turns: [] };
      const nextTurns = trimConversation([...existing.turns, turn], 20);
      return {
        ...current,
        [scopeKey]: {
          ...existing,
          turns: nextTurns
        }
      };
    });
  }, [scopeKey]);

  const patchLastAssistantTurnMeta = useCallback((meta: { resultCards: AiResultCard[]; suggestedActions: AiSuggestedAction[] }) => {
    setThreadsByScope((current) => {
      const existing = current[scopeKey];
      if (!existing || existing.turns.length === 0) {
        return current;
      }

      const turns = [...existing.turns];
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        const turn = turns[index];
        if (turn.role !== "assistant") {
          continue;
        }
        turns[index] = {
          ...turn,
          resultCards: meta.resultCards,
          suggestedActions: meta.suggestedActions
        };
        return {
          ...current,
          [scopeKey]: {
            ...existing,
            turns
          }
        };
      }
      return current;
    });
  }, [scopeKey]);

  const runAiConversation = useCallback(
    async (prompt: string, surface: "command" | "inline" | "sidebar") => {
      if (disabled || isRunning) {
        return;
      }

      const userTurn: CommandTurn = {
        id: createId(),
        role: "user",
        content: prompt,
        createdAt: Date.now()
      };
      appendTurn(userTurn);
      setComposerValue("");
      setStreamingText("");
      setSurfaceState((current) => nextCommandSurfaceState(current, { type: "submit" }));
      setIsInlineOpen(true);

      const turnId = createId();
      const conversation = toConversation(trimConversation([...activeTurns, userTurn], 20));

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orgSlug: resolvedOrgSlug ?? undefined,
          mode: "ask",
          phase: "plan",
          userMessage: prompt,
          threadId: activeThreadId ?? createId(),
          turnId,
          surface,
          conversation,
          uiContext: buildUiContext({
            pathname,
            orgSlug: resolvedOrgSlug,
            source: surface === "sidebar" ? "workspace" : "command_bar"
          })
        })
      });

      if (!response.ok || !response.body) {
        appendTurn({
          id: createId(),
          role: "assistant",
          content: "The assistant is unavailable right now.",
          createdAt: Date.now()
        });
        setSurfaceState((current) => nextCommandSurfaceState(current, { type: "response.completed" }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneText = "";
      let streamed = "";
      let capturedMeta: { resultCards: AiResultCard[]; suggestedActions: AiSuggestedAction[] } | null = null;

      const parseEventBlock = (block: string) => {
        const lines = block.split("\n");
        let eventName = "";
        const dataLines: string[] = [];

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();
          if (!line) continue;
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (!eventName || dataLines.length === 0) return;

        try {
          const payload = JSON.parse(dataLines.join("\n")) as {
            text?: string;
            message?: string;
            resultCards?: AiResultCard[];
            suggestedActions?: AiSuggestedAction[];
          };
          if (eventName === "assistant.delta" && typeof payload.text === "string") {
            streamed += payload.text;
            setStreamingText(streamed);
          }
          if (eventName === "assistant.done" && typeof payload.text === "string") {
            doneText = payload.text;
          }
          if (eventName === "assistant.meta") {
            capturedMeta = {
              resultCards: Array.isArray(payload.resultCards) ? payload.resultCards : [],
              suggestedActions: Array.isArray(payload.suggestedActions) ? payload.suggestedActions : []
            };
          }
          if (eventName === "error" && typeof payload.message === "string") {
            doneText = payload.message;
          }
        } catch {
          doneText = "The assistant sent an invalid response.";
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
      } finally {
        if (buffer.trim()) {
          parseEventBlock(buffer.trim());
        }
      }

      const finalText = normalizeSpace(doneText || streamed || "No response.");
      const assistantMeta = capturedMeta as { resultCards: AiResultCard[]; suggestedActions: AiSuggestedAction[] } | null;
      appendTurn({
        id: createId(),
        role: "assistant",
        content: finalText,
        createdAt: Date.now(),
        resultCards: assistantMeta?.resultCards,
        suggestedActions: assistantMeta?.suggestedActions
      });
      if (assistantMeta) {
        patchLastAssistantTurnMeta(assistantMeta);
      }
      setStreamingText("");
      setSurfaceState((current) => nextCommandSurfaceState(current, { type: "response.completed" }));
    },
    [activeThreadId, activeTurns, appendTurn, disabled, isRunning, patchLastAssistantTurnMeta, pathname, resolvedOrgSlug]
  );

  const submitFromComposer = useCallback(async () => {
    const prompt = normalizeSpace(composerValue);
    if (!prompt || isRunning || disabled) {
      return;
    }

    const surface = isSidebarOpen ? "sidebar" : isInlineOpen ? "inline" : "command";
    await runAiConversation(prompt, surface);
  }, [composerValue, disabled, isInlineOpen, isRunning, isSidebarOpen, runAiConversation]);

  const handleAction = useCallback(
    (action: AiSuggestedAction) => {
      if (action.actionType === "handoff_sidebar") {
        setIsSidebarOpen(true);
        setIsInlineOpen(true);
        setSurfaceState((current) => nextCommandSurfaceState(current, { type: "handoff.sidebar" }));
        return;
      }

      if (action.actionType === "navigate") {
        const href = typeof action.payload.href === "string" ? action.payload.href : null;
        if (href) {
          router.push(href);
        }
        return;
      }
    },
    [router]
  );

  const clearThread = useCallback(() => {
    setThreadsByScope((current) => {
      const existing = current[scopeKey] ?? { threadId: createId(), turns: [] };
      return {
        ...current,
        [scopeKey]: {
          ...existing,
          turns: []
        }
      };
    });
    setStreamingText("");
    setSurfaceState((current) => nextCommandSurfaceState(current, { type: "thread.cleared" }));
  }, [scopeKey]);

  const contextLabel = resolvedOrgSlug ? `${activeOrgName} (${resolvedOrgSlug})` : "Account context";

  return (
    <>
      <div className="relative mx-auto w-full max-w-[22rem] xl:max-w-[26rem]" ref={rootRef}>
        <AiComposer
          variant="compact"
          disabled={disabled}
          inputId="org-ai-command-input"
          inputRef={composerRef}
          loading={isRunning}
          onChange={(value) => {
            setComposerValue(value);
            setSurfaceState((current) => nextCommandSurfaceState(current, { type: "input.changed", value }));
          }}
          onSubmit={() => {
            void submitFromComposer();
          }}
          placeholder={resolvedOrgSlug ? "Ask OrgAI in context..." : "Ask OrgAI about your account..."}
          suggestions={[]}
          value={composerValue}
        />

        {isInlineOpen || activeTurns.length > 0 || streamingText ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-[260] space-y-2 rounded-card border bg-surface p-2.5 shadow-floating">
            <InlineThread messages={activeTurns} onAction={handleAction} running={isRunning} streamingText={streamingText} />
            <div className="flex items-center gap-2">
              <Button onClick={() => setIsSidebarOpen(true)} size="sm" type="button" variant="secondary">
                Continue in Sidebar
              </Button>
              <Button
                onClick={() => {
                  setIsInlineOpen(false);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Hide
              </Button>
              {activeTurns.length > 0 ? (
                <Button onClick={clearThread} size="sm" type="button" variant="ghost">
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <Panel
        contentClassName="space-y-3"
        footer={
          <div className="space-y-2">
            <AiComposer
              disabled={disabled}
              loading={isRunning}
              onChange={setComposerValue}
              onSubmit={() => {
                void submitFromComposer();
              }}
              placeholder={resolvedOrgSlug ? `Continue with ${activeOrgName}...` : "Continue conversation..."}
              suggestions={isRunning ? [] : suggestions}
              value={composerValue}
            />
            {activeTurns.length > 0 ? (
              <div className="flex items-center justify-end">
                <Button onClick={clearThread} size="sm" type="button" variant="ghost">
                  Clear Thread
                </Button>
              </div>
            ) : null}
          </div>
        }
        onClose={() => {
          setIsSidebarOpen(false);
          setSurfaceState((current) => nextCommandSurfaceState(current, { type: "sidebar.closed" }));
        }}
        open={isSidebarOpen}
        globalPanel
        panelClassName="rounded-none border-y-0 border-r-0 max-w-[min(100vw,520px)] !w-[min(100vw,520px)]"
        pushMode="app"
        subtitle="Advanced copilot for long-form planning, entity workflows, and execution reviews."
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Advanced Copilot
          </span>
        }
      >
        <div className="flex h-full min-h-[56vh] flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{contextLabel}</div>
          <div className="min-h-0 flex-1" ref={sidebarScrollRef}>
            <InlineThread compact messages={activeTurns} onAction={handleAction} running={isRunning} streamingText={streamingText} />
          </div>
        </div>
      </Panel>
    </>
  );
}
