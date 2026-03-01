import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/brand/icon.svg", request.url), { status: 307 });
}
