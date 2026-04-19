import { NextResponse } from "next/server";
import { reconcileAllActiveGoogleSheets, runGoogleSheetOutboxProcessor } from "@/src/features/forms/integrations/google-sheets/sync";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const token = (process.env.GOOGLE_SHEETS_CRON_BEARER_TOKEN ?? "").trim();
  if (!token) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

async function run(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

    const reconciledForms = await reconcileAllActiveGoogleSheets(limit);
    const outbox = await runGoogleSheetOutboxProcessor({ batchSize: 500 });

    return NextResponse.json({
      ok: true,
      reconciledForms,
      processedOutboxGroups: outbox.processedGroups,
      lockedOutboxEvents: outbox.lockedEvents
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "reconcile_failed"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
