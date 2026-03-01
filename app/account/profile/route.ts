import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerForRequest } from "@/lib/supabase/server";

function cleanValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/account?saved=profile", request.url), { status: 303 });
  const supabase = createSupabaseServerForRequest(request, response);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const firstName = cleanValue(formData.get("firstName"));
  const lastName = cleanValue(formData.get("lastName"));
  const avatarPath = cleanValue(formData.get("avatarPath")) || null;

  const updates: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_path: string | null;
  } = {
    user_id: user.id,
    first_name: firstName || null,
    last_name: lastName || null,
    avatar_path: avatarPath
  };

  const { error } = await supabase.from("user_profiles").upsert(updates, {
    onConflict: "user_id"
  });

  if (error) {
    return NextResponse.redirect(new URL("/account?error=profile_save_failed", request.url), { status: 303 });
  }

  return response;
}
