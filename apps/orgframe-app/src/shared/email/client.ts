import "server-only";

import sgMail from "@sendgrid/mail";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: { email: string; name: string };
  replyTo?: string;
  categories?: string[];
  customArgs?: Record<string, string>;
  asm?: { groupId: number; groupsToDisplay?: number[] };
  headers?: Record<string, string>;
  trackingSettings?: {
    clickTracking?: { enable: boolean; enableText?: boolean };
    openTracking?: { enable: boolean };
    subscriptionTracking?: { enable: boolean };
  };
};

export type SendEmailResult = { ok: true; messageId: string } | { ok: false; error: string };

let apiKeyConfigured = false;

function ensureApiKey(): string | null {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!apiKeyConfigured) {
    sgMail.setApiKey(apiKey);
    apiKeyConfigured = true;
  }

  return apiKey;
}

export function getFromAddress(): { email: string; name: string } {
  const email = process.env.SENDGRID_FROM_EMAIL?.trim() || "no-reply@orgframe.app";
  const name = process.env.SENDGRID_FROM_NAME?.trim() || "OrgFrame";
  return { email, name };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = ensureApiKey();
  if (!apiKey) {
    return { ok: false, error: "sendgrid_api_key_missing" };
  }

  try {
    const [response] = await sgMail.send({
      to: input.to,
      from: input.from ?? getFromAddress(),
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      replyTo: input.replyTo,
      categories: input.categories,
      customArgs: input.customArgs,
      asm: input.asm,
      headers: input.headers,
      trackingSettings: input.trackingSettings ?? {
        clickTracking: { enable: true, enableText: false },
        openTracking: { enable: true }
      }
    });
    const messageId = (response?.headers?.["x-message-id"] as string | undefined) ?? "";
    return { ok: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_sendgrid_error";
    return { ok: false, error: message };
  }
}
