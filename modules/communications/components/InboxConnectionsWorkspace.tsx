"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { connectFacebookPageAction, disconnectInboxIntegrationAction, getInboxConnectionsDataAction } from "@/modules/communications/actions";
import type { CommChannelIntegration } from "@/modules/communications/types";

type InboxConnectionsWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialIntegrations: CommChannelIntegration[];
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function InboxConnectionsWorkspace({ orgSlug, canWrite, initialIntegrations }: InboxConnectionsWorkspaceProps) {
  const { toast } = useToast();
  const [isMutating, startTransition] = useTransition();
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");

  function refresh(successTitle?: string) {
    startTransition(async () => {
      const result = await getInboxConnectionsDataAction({ orgSlug });
      if (!result.ok) {
        toast({
          title: "Refresh failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setIntegrations(result.data.integrations);
      if (successTitle) {
        toast({ title: successTitle, variant: "success" });
      }
    });
  }

  function connectPage() {
    if (!canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await connectFacebookPageAction({
        orgSlug,
        pageId,
        pageName,
        pageAccessToken
      });

      if (!result.ok) {
        toast({
          title: "Connection failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setPageAccessToken("");
      refresh("Facebook page connected");
    });
  }

  function disconnectIntegration(integrationId: string) {
    if (!canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await disconnectInboxIntegrationAction({
        orgSlug,
        integrationId
      });

      if (!result.ok) {
        toast({
          title: "Disconnect failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      refresh("Integration disconnected");
    });
  }

  return (
    <div className="ui-stack-page">
      {isMutating ? <Alert variant="info">Updating connections...</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Facebook Messenger Connection</CardTitle>
          <CardDescription>
            Connect a Facebook Page per organization. Incoming page messages route to this org&apos;s inbox by Page ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canWrite ? <Alert variant="info">You have read-only access for inbox connections.</Alert> : null}

          <div className="ui-muted-block space-y-2 text-sm text-text-muted">
            <p>1. In Meta, generate a Page Access Token for Messenger.</p>
            <p>2. Paste the Page ID and token below.</p>
            <p>3. Configure webhook callback: <code>/api/webhooks/facebook/messenger</code></p>
          </div>

          <Input disabled={!canWrite} onChange={(event) => setPageId(event.target.value)} placeholder="Facebook Page ID" value={pageId} />
          <Input disabled={!canWrite} onChange={(event) => setPageName(event.target.value)} placeholder="Page name (optional)" value={pageName} />
          <Input
            disabled={!canWrite}
            onChange={(event) => setPageAccessToken(event.target.value)}
            placeholder="Page access token"
            type="password"
            value={pageAccessToken}
          />

          <div className="flex flex-wrap gap-2">
            <Button disabled={!canWrite || isMutating} onClick={connectPage} type="button">
              Connect Facebook Page
            </Button>
            <Button href={`/${orgSlug}/tools/inbox`} variant="secondary">
              Back to Inbox
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Pages</CardTitle>
          <CardDescription>Per-org page connections used for routing Messenger webhooks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {integrations.length === 0 ? <Alert variant="info">No connected pages yet.</Alert> : null}
          {integrations.map((integration) => (
            <div className="ui-list-item" key={integration.id}>
              <p className="font-semibold text-text">{integration.providerAccountName ?? `Page ${integration.providerAccountId}`}</p>
              <p className="text-xs text-text-muted">Page ID: {integration.providerAccountId}</p>
              <p className="text-xs text-text-muted">Status: {integration.status}</p>
              <p className="text-xs text-text-muted">Connected: {formatDateTime(integration.connectedAt)}</p>
              <p className="text-xs text-text-muted">Token: {integration.tokenHint ?? "not stored"}</p>
              {integration.lastError ? <p className="mt-1 text-xs text-danger">Last error: {integration.lastError}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={!canWrite || integration.status === "disconnected"} onClick={() => disconnectIntegration(integration.id)} size="sm" type="button" variant="ghost">
                  Disconnect
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
