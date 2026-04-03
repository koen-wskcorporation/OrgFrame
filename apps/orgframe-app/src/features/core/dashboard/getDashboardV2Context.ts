import { getCurrentUser } from "@/src/features/core/account/server/getCurrentUser";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getOrgAdminNavItems } from "@/src/features/core/navigation/config/adminNav";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import { filterPermissionsByOrgTools, resolveOrgToolAvailability } from "@/src/shared/org/features";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { normalizeDashboardUserPreferences } from "@/src/features/core/dashboard/preferences";
import type {
  DashboardV2Context,
  DashboardV2OrgMembership,
  DashboardNotificationItem,
  DashboardScheduleItem,
  DashboardRegistrationItem,
  DashboardInboxItem,
  NotificationsPersonalHubModule,
  SchedulePersonalHubModule,
  RegistrationsPersonalHubModule,
  InboxPersonalHubModule,
  PersonalHubModule,
  DashboardUserPreferences
} from "@/src/features/core/dashboard/types-v2";

type OrgMembershipRow = {
  role: string;
  org:
    | {
        id: string;
        slug: string;
        name: string;
        logo_path: string | null;
        icon_path: string | null;
        features_json: unknown;
      }
    | Array<{
        id: string;
        slug: string;
        name: string;
        logo_path: string | null;
        icon_path: string | null;
        features_json: unknown;
      }>
    | null;
};

function orderByPreferences<T extends { orgId: string; orgName: string }>(items: T[], preferences: DashboardUserPreferences) {
  const pinned = new Set(preferences.pinnedOrgIds);
  const explicitOrder = new Map(preferences.orgOrder.map((orgId, index) => [orgId, index]));

  return [...items].sort((a, b) => {
    const pinA = pinned.has(a.orgId) ? 0 : 1;
    const pinB = pinned.has(b.orgId) ? 0 : 1;
    if (pinA !== pinB) {
      return pinA - pinB;
    }

    const orderA = explicitOrder.get(a.orgId);
    const orderB = explicitOrder.get(b.orgId);

    if (typeof orderA === "number" || typeof orderB === "number") {
      if (typeof orderA !== "number") {
        return 1;
      }
      if (typeof orderB !== "number") {
        return -1;
      }
      return orderA - orderB;
    }

    return a.orgName.localeCompare(b.orgName);
  });
}

async function listMembershipsWithCapabilities(userId: string): Promise<DashboardV2OrgMembership[]> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .schema("orgs")
    .from("memberships")
    .select("role, org:orgs!inner(id, slug, name, logo_path, icon_path, features_json)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list dashboard memberships: ${error.message}`);
  }

  const rows = (data ?? []) as OrgMembershipRow[];

  const membershipPromises = rows.map(async (row): Promise<DashboardV2OrgMembership | null> => {
    const org = Array.isArray(row.org) ? row.org[0] : row.org;
    if (!org) {
      return null;
    }

    const toolAvailability = resolveOrgToolAvailability(org.features_json);
    const rawPermissions = await resolveOrgRolePermissions(supabase, org.id, row.role);
    const membershipPermissions = filterPermissionsByOrgTools(rawPermissions, toolAvailability);

    return {
      orgId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      role: row.role,
      iconUrl: getOrgAssetPublicUrl(org.icon_path),
      logoUrl: getOrgAssetPublicUrl(org.logo_path),
      toolAvailability,
      membershipPermissions,
      capabilities: getOrgCapabilities(membershipPermissions)
    };
  });

  const resolved = await Promise.all(membershipPromises);

  return resolved.filter((entry): entry is DashboardV2OrgMembership => Boolean(entry));
}

async function readDashboardPreferences(userId: string, orgIds: string[]) {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .schema("people")
    .from("user_dashboard_preferences")
    .select("config_json")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeDashboardUserPreferences(data?.config_json ?? {}, orgIds);
}

async function fetchNotifications(userId: string, orgsById: Map<string, DashboardV2OrgMembership>) {
  const supabase = await createSupabaseServer();
  const orgIds = Array.from(orgsById.keys());

  if (orgIds.length === 0) {
    const empty: NotificationsPersonalHubModule = {
      key: "notifications",
      title: "Notifications",
      description: "Recent items that need your attention.",
      unreadCount: 0,
      items: [],
      error: null
    };

    return empty;
  }

  try {
    const [{ data: rows, error }, unreadResult] = await Promise.all([
      supabase
        .schema("notifications")
        .from("user_notifications")
        .select("id, org_id, item_type, title, body, href, is_read, created_at")
        .eq("recipient_user_id", userId)
        .eq("is_archived", false)
        .in("org_id", orgIds)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .schema("notifications")
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .eq("is_archived", false)
        .eq("is_read", false)
        .in("org_id", orgIds)
    ]);

    if (error) {
      throw new Error(error.message);
    }

    const items: DashboardNotificationItem[] = (rows ?? []).flatMap((row: any) => {
      const org = orgsById.get(String(row.org_id));
      if (!org) {
        return [];
      }

      return [
        {
          id: String(row.id),
          orgId: org.orgId,
          orgSlug: org.orgSlug,
          orgName: org.orgName,
          itemType: String(row.item_type ?? "item"),
          title: String(row.title ?? "Notification"),
          body: typeof row.body === "string" ? row.body : null,
          href: typeof row.href === "string" ? row.href : null,
          isRead: Boolean(row.is_read),
          createdAt: String(row.created_at)
        }
      ];
    });

    return {
      key: "notifications",
      title: "Notifications",
      description: "Recent items that need your attention.",
      unreadCount: unreadResult.count ?? items.filter((item) => !item.isRead).length,
      items,
      error: null
    } satisfies NotificationsPersonalHubModule;
  } catch {
    return {
      key: "notifications",
      title: "Notifications",
      description: "Recent items that need your attention.",
      unreadCount: 0,
      items: [],
      error: "Notifications could not be loaded right now."
    } satisfies NotificationsPersonalHubModule;
  }
}

async function fetchSchedule(orgsById: Map<string, DashboardV2OrgMembership>) {
  const supabase = await createSupabaseServer();
  const nowIso = new Date().toISOString();
  const readableOrgIds = Array.from(orgsById.values())
    .filter((org) => org.capabilities.calendar.canAccess || org.capabilities.events.canAccess || org.capabilities.programs.canAccess)
    .map((org) => org.orgId);

  if (readableOrgIds.length === 0) {
    return {
      key: "schedule",
      title: "Upcoming Schedule",
      description: "Cross-org upcoming events and game activity.",
      items: [],
      error: null
    } satisfies SchedulePersonalHubModule;
  }

  try {
    const { data, error } = await supabase
      .schema("calendar")
      .from("calendar_item_occurrences")
      .select(
        "id, org_id, starts_at_utc, ends_at_utc, timezone, local_date, local_start_time, local_end_time, metadata_json:metadata, calendar_items!inner(id, entry_type:item_type, title, summary, visibility, status, settings_json:settings)"
      )
      .in("org_id", readableOrgIds)
      .eq("status", "scheduled")
      .in("calendar_items.item_type", ["event", "game"])
      .eq("calendar_items.visibility", "published")
      .eq("calendar_items.status", "scheduled")
      .gte("ends_at_utc", nowIso)
      .order("starts_at_utc", { ascending: true })
      .limit(40);

    if (error) {
      throw new Error(error.message);
    }

    const items: DashboardScheduleItem[] = (data ?? []).flatMap((row: any) => {
      const org = orgsById.get(String(row.org_id));
      const entry = Array.isArray(row.calendar_items) ? row.calendar_items[0] : row.calendar_items;

      if (!org || !entry) {
        return [];
      }

      return [
        {
          occurrenceId: String(row.id),
          orgId: org.orgId,
          orgSlug: org.orgSlug,
          orgName: org.orgName,
          title: String(entry.title ?? "Event"),
          summary: typeof entry.summary === "string" ? entry.summary : null,
          entryType: String(entry.entry_type ?? "event"),
          startsAtUtc: String(row.starts_at_utc),
          endsAtUtc: String(row.ends_at_utc),
          href: `/${org.orgSlug}/calendar/${String(row.id)}`
        }
      ];
    });

    return {
      key: "schedule",
      title: "Upcoming Schedule",
      description: "Cross-org upcoming events and game activity.",
      items,
      error: null
    } satisfies SchedulePersonalHubModule;
  } catch {
    return {
      key: "schedule",
      title: "Upcoming Schedule",
      description: "Cross-org upcoming events and game activity.",
      items: [],
      error: "Schedule could not be loaded right now."
    } satisfies SchedulePersonalHubModule;
  }
}

async function fetchRegistrations(userId: string, orgsById: Map<string, DashboardV2OrgMembership>) {
  const supabase = await createSupabaseServer();
  const readableOrgIds = Array.from(orgsById.values())
    .filter((org) => org.capabilities.forms.canAccess || org.capabilities.programs.canAccess)
    .map((org) => org.orgId);

  if (readableOrgIds.length === 0) {
    return {
      key: "registrations",
      title: "Registrations",
      description: "Your recent registration and submission activity.",
      items: [],
      error: null
    } satisfies RegistrationsPersonalHubModule;
  }

  try {
    const { data, error } = await supabase
      .schema("forms")
      .from("org_form_submissions")
      .select("id, org_id, form_id, submitted_by_user_id, status, created_at, updated_at, org_forms!inner(id, slug, name)")
      .eq("submitted_by_user_id", userId)
      .in("org_id", readableOrgIds)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) {
      throw new Error(error.message);
    }

    const items: DashboardRegistrationItem[] = (data ?? []).flatMap((row: any) => {
      const org = orgsById.get(String(row.org_id));
      const form = Array.isArray(row.org_forms) ? row.org_forms[0] : row.org_forms;
      if (!org || !form) {
        return [];
      }

      const formSlug = String(form.slug ?? "").trim();
      if (!formSlug) {
        return [];
      }

      return [
        {
          submissionId: String(row.id),
          orgId: org.orgId,
          orgSlug: org.orgSlug,
          orgName: org.orgName,
          formId: String(form.id),
          formName: String(form.name ?? "Registration"),
          formSlug,
          status: String(row.status ?? "submitted"),
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
          href: `/${org.orgSlug}/register/${formSlug}`
        }
      ];
    });

    return {
      key: "registrations",
      title: "Registrations",
      description: "Your recent registration and submission activity.",
      items,
      error: null
    } satisfies RegistrationsPersonalHubModule;
  } catch {
    return {
      key: "registrations",
      title: "Registrations",
      description: "Your recent registration and submission activity.",
      items: [],
      error: "Registrations could not be loaded right now."
    } satisfies RegistrationsPersonalHubModule;
  }
}

async function fetchInbox(orgsById: Map<string, DashboardV2OrgMembership>) {
  const supabase = await createSupabaseServer();
  const readableOrgIds = Array.from(orgsById.values())
    .filter((org) => org.capabilities.communications.canAccess)
    .map((org) => org.orgId);

  if (readableOrgIds.length === 0) {
    return {
      key: "inbox",
      title: "Inbox Activity",
      description: "Recent cross-org communication threads.",
      unreadLikeCount: 0,
      items: [],
      error: null
    } satisfies InboxPersonalHubModule;
  }

  try {
    const { data, error } = await supabase
      .schema("communications")
      .from("conversations")
      .select("id, org_id, channel_type, resolution_status, subject, preview_text, last_message_at, archived_at")
      .in("org_id", readableOrgIds)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false })
      .limit(40);

    if (error) {
      throw new Error(error.message);
    }

    const items: DashboardInboxItem[] = (data ?? []).flatMap((row: any) => {
      const org = orgsById.get(String(row.org_id));
      if (!org) {
        return [];
      }

      return [
        {
          conversationId: String(row.id),
          orgId: org.orgId,
          orgSlug: org.orgSlug,
          orgName: org.orgName,
          channelType: String(row.channel_type ?? "other"),
          resolutionStatus: String(row.resolution_status ?? "unresolved"),
          subject: typeof row.subject === "string" ? row.subject : null,
          previewText: typeof row.preview_text === "string" ? row.preview_text : null,
          lastMessageAt: String(row.last_message_at),
          href: `/${org.orgSlug}/tools/inbox`
        }
      ];
    });

    const unreadLikeCount = items.filter((item) => item.resolutionStatus === "unresolved" || item.resolutionStatus === "suggested").length;

    return {
      key: "inbox",
      title: "Inbox Activity",
      description: "Recent cross-org communication threads.",
      unreadLikeCount,
      items,
      error: null
    } satisfies InboxPersonalHubModule;
  } catch {
    return {
      key: "inbox",
      title: "Inbox Activity",
      description: "Recent cross-org communication threads.",
      unreadLikeCount: 0,
      items: [],
      error: "Inbox activity could not be loaded right now."
    } satisfies InboxPersonalHubModule;
  }
}

function buildAdminSections(input: {
  organizations: DashboardV2OrgMembership[];
  preferences: DashboardUserPreferences;
  notifications: DashboardNotificationItem[];
  schedule: DashboardScheduleItem[];
  registrations: DashboardRegistrationItem[];
  inbox: DashboardInboxItem[];
}) {
  const { organizations, preferences, notifications, schedule, registrations, inbox } = input;

  const orderedOrganizations = orderByPreferences(organizations, preferences);

  return orderedOrganizations
    .filter((org) => org.capabilities.manage.canAccessArea)
    .map((org) => {
      const navItems = getOrgAdminNavItems(org.orgSlug, {
        capabilities: org.capabilities,
        toolAvailability: org.toolAvailability
      })
        .filter((item) => item.showInHome)
        .slice(0, 6)
        .map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description,
          href: `/${org.orgSlug}${item.href}`
        }));

      return {
        orgId: org.orgId,
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        role: org.role,
        iconUrl: org.iconUrl,
        quickLinks: navItems,
        statuses: {
          unreadNotifications: notifications.filter((item) => item.orgId === org.orgId && !item.isRead).length,
          upcomingEvents: schedule.filter((item) => item.orgId === org.orgId).length,
          registrationTasks: registrations.filter((item) => item.orgId === org.orgId).length,
          openInboxConversations: inbox.filter((item) => item.orgId === org.orgId && item.resolutionStatus !== "resolved").length
        }
      };
    });
}

export async function getDashboardV2Context(): Promise<DashboardV2Context> {
  const sessionUser = await requireAuth();

  const [currentUser, organizations] = await Promise.all([getCurrentUser({ sessionUser }), listMembershipsWithCapabilities(sessionUser.id)]);

  const orgIds = organizations.map((org) => org.orgId);
  const preferences = await readDashboardPreferences(sessionUser.id, orgIds);
  const orgsById = new Map(organizations.map((org) => [org.orgId, org]));

  const [notificationsModule, scheduleModule, registrationsModule, inboxModule] = await Promise.all([
    fetchNotifications(sessionUser.id, orgsById),
    fetchSchedule(orgsById),
    fetchRegistrations(sessionUser.id, orgsById),
    fetchInbox(orgsById)
  ]);

  const modulesByKey = new Map<PersonalHubModule["key"], PersonalHubModule>([
    [notificationsModule.key, notificationsModule],
    [scheduleModule.key, scheduleModule],
    [registrationsModule.key, registrationsModule],
    [inboxModule.key, inboxModule]
  ]);

  const visibleModules = preferences.moduleOrder
    .map((key) => modulesByKey.get(key))
    .filter((module): module is PersonalHubModule => Boolean(module))
    .filter((module) => !preferences.hiddenModules.includes(module.key));

  const adminSections = buildAdminSections({
    organizations,
    preferences,
    notifications: notificationsModule.items,
    schedule: scheduleModule.items,
    registrations: registrationsModule.items,
    inbox: inboxModule.items
  });

  return {
    user: {
      userId: sessionUser.id,
      email: currentUser?.email ?? sessionUser.email,
      firstName: currentUser?.firstName ?? null,
      lastName: currentUser?.lastName ?? null,
      avatarUrl: currentUser?.avatarUrl ?? null
    },
    organizations,
    personalHub: {
      modules: visibleModules
    },
    adminRail: {
      sections: adminSections
    },
    preferences
  };
}
