import { NextResponse } from "next/server";
import { reconcileGoogleSheetBySpreadsheetId, runGoogleSheetOutboxProcessor, verifyGoogleSheetWebhookSignature } from "@/src/features/forms/integrations/google-sheets/sync";

export const runtime = "nodejs";

type WebhookPayload = {
  spreadsheetId?: unknown;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-sports-sheets-signature") ?? "";
    const timestamp = request.headers.get("x-sports-sheets-timestamp") ?? "";

    const verified = verifyGoogleSheetWebhookSignature({
      rawBody,
      signature,
      timestamp
    });

    if (!verified) {
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    let payload: WebhookPayload;
    try {
      payload = (rawBody ? JSON.parse(rawBody) : {}) as WebhookPayload;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const spreadsheetId = typeof payload.spreadsheetId === "string" ? payload.spreadsheetId.trim() : "";
    if (!spreadsheetId) {
      return NextResponse.json({ ok: false, error: "missing_spreadsheet_id" }, { status: 400 });
    }

    const syncedForms = await reconcileGoogleSheetBySpreadsheetId(spreadsheetId);
    const outbox = await runGoogleSheetOutboxProcessor({ batchSize: 200 });

    return NextResponse.json({
      ok: true,
      syncedForms,
      processedOutboxGroups: outbox.processedGroups,
      lockedOutboxEvents: outbox.lockedEvents
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "webhook_failed"
      },
      { status: 500 }
    );
  }
}
