import { NextResponse } from "next/server";
import { updatePanelWidthPreferenceAction } from "@/src/features/core/preferences/actions";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const widthPx = (body as { widthPx?: unknown })?.widthPx;
  const panelKey = (body as { panelKey?: unknown })?.panelKey;
  if (typeof widthPx !== "number") {
    return NextResponse.json({ ok: false, error: "widthPx must be a number." }, { status: 400 });
  }
  if (typeof panelKey !== "string" || panelKey.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "panelKey is required." }, { status: 400 });
  }

  const result = await updatePanelWidthPreferenceAction({ panelKey, widthPx });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
