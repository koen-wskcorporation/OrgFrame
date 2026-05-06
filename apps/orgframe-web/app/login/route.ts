import { NextResponse } from "next/server";
import { getAppEntryUrl } from "@/src/shared/marketing/appOrigin";

// Marketing-side `/login` is just a thin redirect into the app. We
// deliberately do NOT consult Supabase here:
//
//   1. The marketing site lives on a different subdomain than the app, so
//      the auth cookie isn't always present and any session check is
//      unreliable.
//   2. The app's home page (and middleware on the canonical auth host)
//      already handles signed-in vs. unauthenticated routing correctly. We
//      want a single source of truth for that decision.
//
// The result: marketing → orgframe.app → (if needed) auth.orgframe.app.
export function GET() {
  return NextResponse.redirect(getAppEntryUrl(), { status: 307 });
}
