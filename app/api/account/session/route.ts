import { NextResponse } from "next/server";
import { getSignedProfileAvatarUrl } from "@/lib/account/getSignedProfileAvatarUrl";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json(
      {
        authenticated: false
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, avatar_path")
    .eq("user_id", sessionUser.id)
    .maybeSingle();

  const avatarPath = profile?.avatar_path ?? null;
  const avatarUrl = avatarPath ? await getSignedProfileAvatarUrl(avatarPath, 60 * 10) : null;

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        userId: sessionUser.id,
        email: sessionUser.email,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        avatarUrl
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
