"use client";

import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Input } from "@orgframe/ui/primitives/input";
import { useWorkspaceCopilot } from "@/src/features/workspace/copilot/WorkspaceCopilotProvider";

export function WorkspaceCopilotRail() {
  const {
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
  } = useWorkspaceCopilot();

  return (
    <Card className="flex max-h-[calc(100dvh-var(--org-header-height,0px)-var(--layout-gap)*3)] min-h-[24rem] flex-col">
      <CardHeader className="border-b border-border/60">
        <CardTitle>Copilot</CardTitle>
        <CardDescription>Natural-language command center for workspace and manage actions.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
        <div className="max-h-[38vh] space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
          {messages.length === 0 ? <p className="text-sm text-text-muted">Ask Copilot to import, update, assign, schedule, or review data.</p> : null}
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-text-muted">{message.role === "user" ? "You" : "Assistant"}</p>
              <p className="text-sm text-text">{message.content}</p>
            </div>
          ))}
          {assistantDraft ? (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-text-muted">Assistant</p>
              <p className="text-sm text-text">{assistantDraft}</p>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Input
            disabled={busy}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitPrompt();
              }
            }}
            placeholder="Ask Copilot..."
            value={composer}
          />
          <Button disabled={busy || !composer.trim()} onClick={() => void submitPrompt()}>
            {busy ? "Working..." : "Send"}
          </Button>
        </div>

        {latestExecutionSummary ? <Alert variant="success">{latestExecutionSummary}</Alert> : null}
        {latestError ? <Alert variant="warning">{latestError}</Alert> : null}

        {latestProposal ? (
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <p className="text-sm font-medium text-text">{latestProposal.summary}</p>
            {latestProposal.ambiguity ? <Alert variant="info">{latestProposal.ambiguity.description}</Alert> : null}
            {latestProposal.warnings.length > 0 ? <Alert variant="warning">{latestProposal.warnings.join(" ")}</Alert> : null}
            {latestProposal.executable && latestProposalId ? (
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void confirmProposal()} size="sm">
                  Confirm
                </Button>
                <Button disabled={busy} onClick={() => void cancelProposal()} size="sm" variant="secondary">
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
