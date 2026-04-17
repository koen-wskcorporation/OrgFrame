import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { listUserOrgs } from "@/src/shared/org/listUserOrgs";

type NotificationRow = {
  id: string;
  org_id: string;
  item_type: string;
  title: string;
  body: string | null;
  href: string | null;
  is_read: boolean;
  created_at: string;
};

export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json(
      {
        authenticated: false
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const [supabase, memberships] = await Promise.all([createSupabaseServer(), listUserOrgs().catch(() => [])]);
  const orgLookup = new Map(memberships.map((membership) => [membership.orgId, membership]));

  const [{ data, error }, unreadResult] = await Promise.all([
    supabase
      .schema("notifications").from("user_notifications")
      .select("id, org_id, item_type, title, body, href, is_read, created_at")
      .eq("recipient_user_id", sessionUser.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .schema("notifications").from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", sessionUser.id)
      .eq("is_archived", false)
      .eq("is_read", false)
  ]);

  if (error) {
    return NextResponse.json(
      {
        authenticated: true,
        unreadCount: 0,
        notifications: []
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const notifications = (data ?? []).map((row) => {
    const typedRow = row as NotificationRow;
    const membership = orgLookup.get(typedRow.org_id);
    return {
      id: typedRow.id,
      orgId: typedRow.org_id,
      orgName: membership?.orgName ?? null,
      orgSlug: membership?.orgSlug ?? null,
      itemType: typedRow.item_type,
      title: typedRow.title,
      body: typedRow.body,
      href: typedRow.href,
      isRead: typedRow.is_read,
      createdAt: typedRow.created_at
    };
  });

  return NextResponse.json(
    {
      authenticated: true,
      unreadCount: unreadResult.count ?? notifications.filter((item) => !item.isRead).length,
      notifications
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
