import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerForRequest } from "@/lib/supabase/server";

function cleanValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/account?saved=password", request.url), { status: 303 });
  const supabase = createSupabaseServerForRequest(request, response);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const password = cleanValue(formData.get("newPassword"));

  if (password.length < 8) {
    return NextResponse.redirect(new URL("/account?error=weak_password", request.url), { status: 303 });
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return NextResponse.redirect(new URL("/account?error=password_update_failed", request.url), { status: 303 });
  }

  return response;
}
