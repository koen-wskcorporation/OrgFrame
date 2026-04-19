import { Badge } from "@orgframe/ui/primitives/badge";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import type { DashboardV2Context, PersonalHubModule } from "@/src/features/core/dashboard/types-v2";
import { DashboardPreferencesEditor } from "@/src/features/core/dashboard/components/DashboardPreferencesEditor";

function formatRelativeDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const ranges = [
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 }
  ] as const;

  for (const range of ranges) {
    if (Math.abs(deltaSeconds) >= range.seconds) {
      return formatter.format(Math.round(deltaSeconds / range.seconds), range.unit);
    }
  }

  return "Just now";
}

function resolveModuleCta(module: PersonalHubModule) {
  switch (module.key) {
    case "notifications":
      return { href: "/account", label: "Open account" };
    case "schedule":
      return { href: "/account", label: "Open schedule" };
    case "registrations":
      return { href: "/account/players", label: "Open registrations" };
    case "inbox":
      return { href: "/account", label: "Open inbox" };
    default:
      return { href: "/account", label: "Open" };
  }
}

function renderModuleBody(module: PersonalHubModule) {
  if (module.error) {
    return <p className="text-sm text-warning">{module.error}</p>;
  }

  switch (module.key) {
    case "notifications": {
      if (module.items.length === 0) {
        return <p className="text-sm text-text-muted">No notifications right now.</p>;
      }

      return (
        <div className="space-y-2">
          {module.items.slice(0, 8).map((item) => (
            <a className="ui-list-item ui-list-item-hover block" href={item.href ?? `/${item.orgSlug}/tools`} key={item.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{item.title}</p>
                  {item.body ? <p className="line-clamp-2 text-xs text-text-muted">{item.body}</p> : null}
                  <p className="text-[11px] text-text-muted">{item.orgName}</p>
                </div>
                {!item.isRead ? <Badge variant="warning">Unread</Badge> : null}
              </div>
            </a>
          ))}
        </div>
      );
    }
    case "schedule": {
      if (module.items.length === 0) {
        return <p className="text-sm text-text-muted">No upcoming events.</p>;
      }

      return (
        <div className="space-y-2">
          {module.items.slice(0, 8).map((item) => (
            <a className="ui-list-item ui-list-item-hover block" href={item.href} key={item.occurrenceId}>
              <p className="truncate text-sm font-semibold text-text">{item.title}</p>
              <p className="text-xs text-text-muted">
                {item.orgName} · {formatRelativeDateTime(item.startsAtUtc)}
              </p>
            </a>
          ))}
        </div>
      );
    }
    case "registrations": {
      if (module.items.length === 0) {
        return <p className="text-sm text-text-muted">No recent registration updates.</p>;
      }

      return (
        <div className="space-y-2">
          {module.items.slice(0, 8).map((item) => (
            <a className="ui-list-item ui-list-item-hover block" href={item.href} key={item.submissionId}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{item.formName}</p>
                  <p className="text-xs text-text-muted">
                    {item.orgName} · {formatRelativeDateTime(item.updatedAt)}
                  </p>
                </div>
                <Badge variant={item.status === "approved" ? "success" : item.status === "rejected" ? "destructive" : "neutral"}>{item.status}</Badge>
              </div>
            </a>
          ))}
        </div>
      );
    }
    case "inbox": {
      if (module.items.length === 0) {
        return <p className="text-sm text-text-muted">No inbox conversations available.</p>;
      }

      return (
        <div className="space-y-2">
          {module.items.slice(0, 8).map((item) => (
            <a className="ui-list-item ui-list-item-hover block" href={item.href} key={item.conversationId}>
              <p className="truncate text-sm font-semibold text-text">{item.subject ?? item.previewText ?? "Conversation"}</p>
              <p className="text-xs text-text-muted">
                {item.orgName} · {item.channelType} · {formatRelativeDateTime(item.lastMessageAt)}
              </p>
            </a>
          ))}
        </div>
      );
    }
  }
}

function renderModuleSummary(module: PersonalHubModule) {
  switch (module.key) {
    case "notifications":
      return `${module.unreadCount} unread`;
    case "schedule":
      return `${module.items.length} upcoming`;
    case "registrations":
      return `${module.items.length} recent`;
    case "inbox":
      return `${module.unreadLikeCount} unresolved`;
  }
}

export function DashboardV2Page({ context }: { context: DashboardV2Context }) {
  const firstName = context.user.firstName?.trim();
  const title = firstName ? `${firstName}'s Dashboard` : "Dashboard";

  return (
    <main className="app-page-shell pb-10 pt-0">
      <div className="app-page-stack">
        <PageHeader description="Your cross-org personal hub, with admin tools separated by organization." title={title} />

        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Switch org context and open management tools when available.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {context.organizations.length === 0 ? <p className="text-sm text-text-muted">No organizations found.</p> : null}
            {context.organizations.map((organization) => (
              <div className="ui-list-item flex items-center justify-between gap-3" key={organization.orgId}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-surface-muted">
                    {organization.iconUrl ? (
                      <AdaptiveLogo
                        alt={`${organization.orgName} icon`}
                        className="h-full w-full object-contain"
                        src={organization.iconUrl}
                        svgClassName="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-text-muted">{organization.orgName.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">{organization.orgName}</p>
                    <p className="truncate text-xs text-text-muted">/{organization.orgSlug}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button href={`/${organization.orgSlug}`} size="sm" variant="secondary">
                    Open
                  </Button>
                  {organization.capabilities.manage.canAccessArea ? (
                    <Button href={`/${organization.orgSlug}/tools`} size="sm" variant="secondary">
                      Tools
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {context.personalHub.modules.map((module) => {
                const cta = resolveModuleCta(module);
                const isWide = module.key === "notifications" || module.key === "inbox";

                return (
                  <Card className={isWide ? "md:col-span-2" : undefined} key={module.key}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle>{module.title}</CardTitle>
                          <CardDescription>{module.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{renderModuleSummary(module)}</Badge>
                          <Button href={cta.href} size="sm" variant="secondary">
                            {cta.label}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="max-h-[24rem] overflow-auto pt-0">{renderModuleBody(module)}</CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-[calc(var(--layout-gap)+4rem)] lg:self-start">
            <DashboardPreferencesEditor
              initialPreferences={context.preferences}
              orgOptions={context.organizations.map((org) => ({ orgId: org.orgId, orgName: org.orgName }))}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
