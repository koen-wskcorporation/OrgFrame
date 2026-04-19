"use client";

import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import { cn } from "@orgframe/ui/primitives/utils";
import { ContextActionsRow } from "@/src/features/ai/components/ContextActionsRow";
import { EntityResultCard } from "@/src/features/ai/components/EntityResultCard";
import type { CommandTurn } from "@/src/features/ai/components/command-surface";
import type { AiSuggestedAction } from "@/src/features/ai/types";

type InlineThreadProps = {
  messages: CommandTurn[];
  streamingText?: string;
  running?: boolean;
  onAction: (action: AiSuggestedAction) => void;
  compact?: boolean;
};

export function InlineThread({ messages, streamingText = "", running = false, onAction, compact = false }: InlineThreadProps) {
  if (messages.length === 0 && !streamingText) {
    return null;
  }

  return (
    <div className={cn("space-y-2 rounded-card border bg-surface p-2.5 shadow-sm", compact ? "max-h-56 overflow-y-auto" : "max-h-72 overflow-y-auto")}>
      {messages.map((message) => (
        <article
          className={cn(
            "space-y-2 rounded-control border px-3 py-2 text-sm",
            message.role === "assistant" ? "mr-2 border-border bg-surface-muted/25 text-text" : "ml-2 border-accent/35 bg-accent/10 text-text"
          )}
          key={message.id}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.resultCards?.length ? (
            <div className="space-y-2">
              {message.resultCards.map((card) => (
                <EntityResultCard card={card} key={card.id} />
              ))}
            </div>
          ) : null}
          {message.suggestedActions?.length ? <ContextActionsRow actions={message.suggestedActions} onAction={onAction} /> : null}
        </article>
      ))}

      {running ? (
        <div className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text-muted">
          <SpinnerIcon className="h-4 w-4" />
          Assistant is working...
        </div>
      ) : null}

      {!running && streamingText ? (
        <article className="mr-2 rounded-control border border-border bg-surface-muted/25 px-3 py-2 text-sm text-text">
          <p className="whitespace-pre-wrap break-words">{streamingText}</p>
        </article>
      ) : null}
    </div>
  );
}
