"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { useToast } from "@orgframe/ui/primitives/toast";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import { connectFacebookPageAction, disconnectInboxIntegrationAction, getInboxConnectionsDataAction } from "@/src/features/communications/actions";
import type { CommChannelIntegration } from "@/src/features/communications/types";

type InboxConnectionsWorkspaceProps = {
  orgSlug: string;
  canWrite: boolean;
  initialIntegrations: CommChannelIntegration[];
};

type FacebookOauthPage = {
  id: string;
  name: string;
  accessToken: string;
};

type FacebookOauthPagesMessage = {
  type: "orgframe:facebook-oauth-pages";
  orgSlug: string;
  pages: FacebookOauthPage[];
};

type FacebookOauthErrorMessage = {
  type: "orgframe:facebook-oauth-error";
  error: string;
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
  const [oauthPages, setOauthPages] = useState<FacebookOauthPage[]>([]);

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

  function connectPageFromOauth(page: FacebookOauthPage, successTitle = "Facebook page connected") {
    if (!canWrite) {
      return;
    }

    startTransition(async () => {
      const result = await connectFacebookPageAction({
        orgSlug,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.accessToken
      });

      if (!result.ok) {
        toast({
          title: "Connection failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setOauthPages((existing) => existing.filter((item) => item.id !== page.id));
      refresh(successTitle);
    });
  }

  function launchFacebookPopup() {
    if (!canWrite) {
      return;
    }

    const width = 620;
    const height = 760;
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));

    const popup = window.open(
      `/api/integrations/facebook/oauth/start?orgSlug=${encodeURIComponent(orgSlug)}`,
      "orgframe-facebook-oauth",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      toast({
        title: "Popup blocked",
        description: "Allow popups for this site to connect Facebook.",
        variant: "destructive"
      });
      return;
    }

    popup.focus();
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

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as FacebookOauthPagesMessage | FacebookOauthErrorMessage | null;
      if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
        return;
      }

      if (payload.type === "orgframe:facebook-oauth-error") {
        toast({
          title: "Facebook connection failed",
          description: payload.error,
          variant: "destructive"
        });
        return;
      }

      if (payload.type !== "orgframe:facebook-oauth-pages") {
        return;
      }

      if (payload.orgSlug !== orgSlug) {
        return;
      }

      if (!Array.isArray(payload.pages) || payload.pages.length === 0) {
        toast({
          title: "No pages found",
          description: "No Facebook pages were available on this account.",
          variant: "destructive"
        });
        return;
      }

      setOauthPages(payload.pages);

      if (payload.pages.length === 1) {
        const [singlePage] = payload.pages;
        if (singlePage) {
          connectPageFromOauth(singlePage, "Facebook page connected automatically");
        }
        return;
      }

      toast({
        title: "Choose a page",
        description: `Found ${payload.pages.length} pages. Select which page to connect.`,
        variant: "info"
      });
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [orgSlug, toast]);

  return (
    <div className="ui-stack-page">
      {isMutating ? <Alert variant="info">Updating connections...</Alert> : null}

      <WorkspaceCardShell
        contentClassName="app-section-stack"
        description="Connect one or more Facebook Pages for this organization. Webhook events route to this org by connected Page ID."
        title="Facebook Messenger Connection"
      >
          {!canWrite ? <Alert variant="info">You have read-only access for inbox connections.</Alert> : null}

          <div className="ui-muted-block space-y-2 text-sm text-text-muted">
            <p>1. Click Connect with Facebook.</p>
            <p>2. Log in and grant page permissions in the popup.</p>
            <p>3. If multiple pages are returned, pick which one to link to this org.</p>
            <p>4. Configure webhook callback in Meta: <code>/api/webhooks/facebook/messenger</code>.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!canWrite || isMutating} onClick={launchFacebookPopup} type="button">
              Connect with Facebook
            </Button>
            <Button href="/tools/inbox" variant="secondary">
              Back to Inbox
            </Button>
          </div>

          {oauthPages.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Pick a Page to Connect</p>
              {oauthPages.map((page) => (
                <div className="ui-list-row" key={page.id}>
                  <div className="ui-list-row-content">
                    <p className="ui-list-row-title">{page.name}</p>
                    <p className="ui-list-row-meta">Page ID: {page.id}</p>
                  </div>
                  <div className="ui-list-row-actions">
                    <Button disabled={!canWrite || isMutating} onClick={() => connectPageFromOauth(page)} size="sm" type="button">
                      Connect This Page
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
      </WorkspaceCardShell>

      <WorkspaceCardShell
        contentClassName="ui-list-stack"
        description="Per-org page connections used for routing Messenger webhooks."
        title="Connected Pages"
      >
          {integrations.length === 0 ? <Alert variant="info">No connected pages yet.</Alert> : null}
          {integrations.map((integration) => (
            <div className="ui-list-row" key={integration.id}>
              <div className="ui-list-row-content">
                <p className="ui-list-row-title">{integration.providerAccountName ?? `Page ${integration.providerAccountId}`}</p>
                <p className="ui-list-row-meta">Page ID: {integration.providerAccountId}</p>
                <p className="ui-list-row-meta">Status: {integration.status}</p>
                <p className="ui-list-row-meta">Connected: {formatDateTime(integration.connectedAt)}</p>
                <p className="ui-list-row-meta">Token: {integration.tokenHint ?? "not stored"}</p>
                {integration.lastError ? <p className="mt-1 text-xs text-destructive">Last error: {integration.lastError}</p> : null}
              </div>
              <div className="ui-list-row-actions">
                <Button
                  disabled={!canWrite || integration.status === "disconnected"}
                  onClick={() => disconnectIntegration(integration.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ))}
      </WorkspaceCardShell>
    </div>
  );
}
