import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeDisplayName } from "@/src/features/communications/normalization";

type FacebookGraphError = {
  error?: {
    message?: string;
    code?: number;
    type?: string;
    fbtrace_id?: string;
  };
};

export type FacebookPageIdentity = {
  id: string;
  name: string;
};

export type FacebookMessengerInboundRecord = {
  pageId: string;
  externalIdentityId: string;
  externalThreadId: string;
  externalMessageId: string | null;
  direction: "inbound" | "outbound";
  bodyText: string;
  sentAtIso: string;
  senderLabel: string | null;
  identityDisplayLabel: string | null;
  metadata: Record<string, unknown>;
};

function ensureOk(response: Response, payload: unknown) {
  if (response.ok) {
    return;
  }

  const graphError = payload as FacebookGraphError;
  const message = graphError?.error?.message ?? `Facebook Graph error (${response.status})`;
  throw new Error(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function fetchGraph(path: string, accessToken: string, init?: RequestInit) {
  const url = new URL(`https://graph.facebook.com/v22.0/${path.replace(/^\/+/, "")}`);
  if (init?.method && init.method !== "GET") {
    url.searchParams.set("access_token", accessToken);
  } else {
    url.searchParams.set("access_token", accessToken);
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as unknown;
  ensureOk(response, payload);
  return payload;
}

export async function verifyFacebookPageAccessToken(input: { pageId: string; pageAccessToken: string }) {
  const pageId = input.pageId.trim();
  if (!pageId) {
    throw new Error("Facebook page ID is required.");
  }

  const payload = (await fetchGraph(`${encodeURIComponent(pageId)}?fields=id,name`, input.pageAccessToken)) as {
    id?: string;
    name?: string;
  };

  const resolvedId = String(payload.id ?? "").trim();
  if (!resolvedId) {
    throw new Error("Facebook page could not be verified.");
  }

  if (resolvedId !== pageId) {
    throw new Error("Facebook page ID did not match the provided page access token.");
  }

  return {
    id: resolvedId,
    name: String(payload.name ?? "").trim() || null
  };
}

export async function subscribeFacebookPageWebhook(input: { pageId: string; pageAccessToken: string }) {
  const pageId = input.pageId.trim();
  const response = (await fetchGraph(`${encodeURIComponent(pageId)}/subscribed_apps`, input.pageAccessToken, {
    method: "POST"
  })) as {
    success?: boolean;
  };

  return Boolean(response.success);
}

export function verifyFacebookWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  const provided = (signatureHeader ?? "").replace(/^sha256=/, "").trim();
  if (!provided) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function fallbackMessageBody(input: { message?: Record<string, unknown>; postback?: Record<string, unknown> }) {
  const message = input.message;
  const postback = input.postback;

  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (text.length > 0) {
    return text;
  }

  const postbackTitle = typeof postback?.title === "string" ? postback.title.trim() : "";
  if (postbackTitle.length > 0) {
    return `[Postback] ${postbackTitle}`;
  }

  const postbackPayload = typeof postback?.payload === "string" ? postback.payload.trim() : "";
  if (postbackPayload.length > 0) {
    return `[Postback] ${postbackPayload}`;
  }

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.length > 0) {
    return "[Attachment]";
  }

  return "[Unsupported message]";
}

export function parseFacebookMessengerWebhookPayload(payload: unknown): FacebookMessengerInboundRecord[] {
  const body = asRecord(payload);
  if (body.object !== "page") {
    return [];
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
  const records: FacebookMessengerInboundRecord[] = [];

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const entryPageId = String(entry.id ?? "").trim();
    const messagingEvents = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const eventValue of messagingEvents) {
      const event = asRecord(eventValue);
      const sender = asRecord(event.sender);
      const recipient = asRecord(event.recipient);
      const message = asRecord(event.message);
      const postback = asRecord(event.postback);

      const senderId = String(sender.id ?? "").trim();
      const recipientId = String(recipient.id ?? "").trim();
      const pageId = entryPageId || recipientId || senderId;

      const isEcho = Boolean(message.is_echo);
      const participantId = isEcho ? recipientId : senderId;

      if (!pageId || !participantId) {
        continue;
      }

      const externalMessageId = typeof message.mid === "string" && message.mid.trim().length > 0 ? message.mid.trim() : null;
      const timestampMillis = Number(event.timestamp ?? Date.now());
      const sentAtIso = Number.isFinite(timestampMillis) ? new Date(timestampMillis).toISOString() : new Date().toISOString();
      const bodyText = fallbackMessageBody({ message, postback });

      records.push({
        pageId,
        externalIdentityId: participantId,
        externalThreadId: `${pageId}:${participantId}`,
        externalMessageId,
        direction: isEcho ? "outbound" : "inbound",
        bodyText,
        sentAtIso,
        senderLabel: null,
        identityDisplayLabel: null,
        metadata: {
          provider: "facebook",
          isEcho,
          event,
          entry: {
            id: pageId,
            time: entry.time ?? null
          },
          postbackPayload: postback.payload ?? null,
          messageAttachmentsCount: Array.isArray(message.attachments) ? message.attachments.length : 0
        }
      });
    }
  }

  return records;
}

export async function fetchFacebookMessengerUserName(input: { pageAccessToken: string; userId: string }) {
  const userId = input.userId.trim();
  if (!userId) {
    return null;
  }

  const payload = (await fetchGraph(`${encodeURIComponent(userId)}?fields=name`, input.pageAccessToken)) as {
    name?: string;
  };

  return normalizeDisplayName(payload.name ?? null);
}

export function toFacebookPageIdentityLabel(page: FacebookPageIdentity | null, fallbackPageId: string) {
  if (!page) {
    return `Facebook Page ${fallbackPageId}`;
  }

  const label = page.name.trim();
  if (!label) {
    return `Facebook Page ${page.id}`;
  }

  return `${label} (${page.id})`;
}
