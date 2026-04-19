import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/brand/favicon.svg", request.url), { status: 307 });
}
