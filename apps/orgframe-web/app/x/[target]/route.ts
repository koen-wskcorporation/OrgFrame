import { NextResponse } from "next/server";
import { resolveCrossAppOrigin } from "../../../lib/cross-app-origin";

type ParsedParams = {
  target?: string;
};

export async function GET(request: Request, context: { params: Promise<unknown> }) {
  const params = (await context.params) as ParsedParams;
  const target = params.target;
  if (target !== "app" && target !== "web") {
    return NextResponse.json({ error: "Invalid cross-app target" }, { status: 404 });
  }

  const destination = new URL("/", resolveCrossAppOrigin(request, target));
  destination.search = new URL(request.url).search;

  return NextResponse.redirect(destination, { status: 307 });
}
