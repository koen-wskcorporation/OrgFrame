import { Chip } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";
import { Plus } from "lucide-react";
import type { DashboardV2Context, PersonalHubModule } from "@/src/features/core/dashboard/types-v2";
import { DashboardOrgManageButton } from "@/src/features/core/dashboard/components/DashboardOrgManageButton";
import { AccountSidebar } from "@/src/features/core/account/components/AccountSidebar";
import { AppShell } from "@/src/features/core/layout/components/AppShell";
import { getOrgAdminNavTree, prefixAdminNavHrefs } from "@/src/features/core/navigation/config/adminNav";
import { ORG_TYPE_LABELS } from "@/src/shared/org/orgTypes";

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
      return { href: "/inbox", label: "Open inbox" };
    case "schedule":
      return { href: "/settings", label: "Open schedule" };
    case "registrations":
      return { href: "/profiles", label: "Open registrations" };
    case "inbox":
      return { href: "/inbox", label: "Open inbox" };
    default:
      return { href: "/settings", label: "Open" };
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
            <a className="ui-list-item ui-list-item-hover block" href={item.href ?? `/${item.orgSlug}/manage`} key={item.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{item.title}</p>
                  {item.body ? <p className="line-clamp-2 text-xs text-text-muted">{item.body}</p> : null}
                  <p className="text-[11px] text-text-muted">{item.orgName}</p>
                </div>
                {!item.isRead ? <Chip status={false} variant="warning">Unread</Chip> : null}
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
            <div className="ui-list-item block" key={item.occurrenceId}>
              <p className="truncate text-sm font-semibold text-text">{item.title}</p>
              <p className="text-xs text-text-muted">
                {item.orgName} · {formatRelativeDateTime(item.startsAtUtc)}
              </p>
            </div>
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
                <Chip status={false} variant={item.status === "approved" ? "success" : item.status === "rejected" ? "destructive" : "neutral"}>{item.status}</Chip>
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
  return (
    <AppShell
      topbar={null}
      sidebar={
        <AccountSidebar
          avatarUrl={context.user.avatarUrl}
          email={context.user.email}
          firstName={context.user.firstName}
          lastName={context.user.lastName}
          orgCount={context.organizations.length}
        />
      }
    >
        <div className="app-page-stack">
          <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Organizations</CardTitle>
                <CardDescription>Switch org context and open management modules when available.</CardDescription>
              </div>
              {context.organizations.length > 0 ? (
                <Button intent="add" href="/create" size="sm" variant="secondary">Add</Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {context.organizations.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border/70 bg-surface-muted/30 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-text">Create your first organization</p>
                <p className="max-w-sm text-sm text-text-muted">
                  Set up a workspace to start managing programs, events, and members.
                </p>
                <Button href="/create" size="md">
                  <Plus className="h-4 w-4" />
                  Create Organization
                </Button>
              </div>
            ) : null}
            {context.organizations.map((organization) => (
              <div className="ui-list-item flex items-center justify-between gap-3" key={organization.orgId}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center">
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
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text">{organization.orgName}</p>
                      {organization.orgType ? (
                        <Chip status={false} variant="neutral">{ORG_TYPE_LABELS[organization.orgType]}</Chip>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-text-muted">{organization.displayHost}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button href={`/${organization.orgSlug}`} size="sm" variant="secondary">
                    Open
                  </Button>
                  {organization.capabilities.manage.canAccessArea ? (
                    <DashboardOrgManageButton
                      manageHref={`/${organization.orgSlug}/manage`}
                      manageNavItems={prefixAdminNavHrefs(
                        getOrgAdminNavTree(organization.orgSlug, {
                          capabilities: organization.capabilities,
                          toolAvailability: organization.toolAvailability
                        }),
                        organization.orgSlug
                      )}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

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
                        <Chip status={false}>{renderModuleSummary(module)}</Chip>
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
        </div>
    </AppShell>
  );
}
