import { NextResponse } from "next/server";
import { getSignedProfileAvatarUrl } from "@/src/features/core/account/storage/getSignedProfileAvatarUrl";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { listUserOrgs } from "@/src/shared/org/listUserOrgs";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { HeaderAccountState } from "@/src/features/core/layout/types";

export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    const payload: HeaderAccountState = {
      authenticated: false
    };
    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase
    .schema("people").from("users")
    .select("first_name, last_name, avatar_path")
    .eq("user_id", sessionUser.id)
    .maybeSingle();

  const avatarPath = profile?.avatar_path ?? null;
  const avatarUrl = avatarPath ? await getSignedProfileAvatarUrl(avatarPath, 60 * 10) : null;
  const organizations = await listUserOrgs().catch(() => []);
  const payload: HeaderAccountState = {
    authenticated: true,
    user: {
      userId: sessionUser.id,
      email: sessionUser.email,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      avatarUrl
    },
    organizations: organizations.map((membership) => ({
      orgId: membership.orgId,
      orgName: membership.orgName,
      orgSlug: membership.orgSlug,
      iconUrl: getOrgAssetPublicUrl(membership.iconPath ?? membership.logoPath)
    }))
  };

  return NextResponse.json(
    payload,
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
