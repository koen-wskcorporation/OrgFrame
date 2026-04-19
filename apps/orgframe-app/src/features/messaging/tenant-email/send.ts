import "server-only";

import { sendEmail } from "@/src/shared/email/client";
import { resolveOrgSenderIdentity } from "./identity";
import { isSuppressed } from "./suppression";
import { tryReserveSendSlot } from "./quota";
import { recordSend } from "./logging";
import { buildUnsubscribeUrl } from "./unsubscribe";

function getAppOrigin(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }
  return "https://orgframe.app";
}

function injectUnsubscribeLink(html: string, unsubscribeUrl: string, orgName: string): string {
  if (html.includes("{{UNSUBSCRIBE_URL}}")) {
    return html.replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl).replace(/\{\{ORG_NAME\}\}/g, orgName);
  }

  const footer = `
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#697079;font-size:12px;line-height:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    You received this email from ${orgName}.
    <a href="${unsubscribeUrl}" style="color:#697079;text-decoration:underline;">Unsubscribe</a>.
  </div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return html + footer;
}

export type SendTenantEmailInput = {
  orgId: string;
  to: string;
  subject: string;
  html: string;
  contactId?: string | null;
  templateKey?: string;
  category?: string;
  customArgs?: Record<string, string>;
};

export type SendTenantEmailResult =
  | { ok: true; sendId: string | null; messageId: string }
  | { ok: false; reason: "suppressed" | "quota_exceeded" | "send_failed" | "identity_unresolved"; error?: string; sendId: string | null };

export async function sendTenantEmail(input: SendTenantEmailInput): Promise<SendTenantEmailResult> {
  const toEmail = input.to.trim().toLowerCase();

  if (await isSuppressed(input.orgId, toEmail)) {
    const sendId = await recordSend({
      orgId: input.orgId,
      identityId: null,
      contactId: input.contactId,
      toEmail,
      fromEmail: "(suppressed)",
      subject: input.subject,
      templateKey: input.templateKey,
      category: input.category,
      status: "suppressed"
    });
    return { ok: false, reason: "suppressed", sendId };
  }

  const identity = await resolveOrgSenderIdentity(input.orgId);

  if (!(await tryReserveSendSlot(input.orgId))) {
    const sendId = await recordSend({
      orgId: input.orgId,
      identityId: identity.identityId,
      contactId: input.contactId,
      toEmail,
      fromEmail: identity.fromEmail,
      subject: input.subject,
      templateKey: input.templateKey,
      category: input.category,
      status: "quota_exceeded"
    });
    return { ok: false, reason: "quota_exceeded", sendId };
  }

  const appOrigin = getAppOrigin();
  const unsubscribeUrl = buildUnsubscribeUrl({
    orgId: input.orgId,
    email: toEmail,
    appOrigin
  });
  const oneClickUrl = `${appOrigin}/email/unsubscribe/one-click?t=${unsubscribeUrl.split("t=")[1]}`;
  const htmlWithFooter = injectUnsubscribeLink(input.html, unsubscribeUrl, identity.fromName);

  const result = await sendEmail({
    to: toEmail,
    from: { email: identity.fromEmail, name: identity.fromName },
    replyTo: identity.replyTo,
    subject: input.subject,
    html: htmlWithFooter,
    categories: [
      "tenant",
      `org:${input.orgId}`,
      ...(input.category ? [input.category] : [])
    ],
    customArgs: {
      org_id: input.orgId,
      ...(input.contactId ? { contact_id: input.contactId } : {}),
      ...(input.templateKey ? { template_key: input.templateKey } : {}),
      ...(input.customArgs ?? {})
    },
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>, <${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    },
    trackingSettings: {
      clickTracking: { enable: true, enableText: false },
      openTracking: { enable: true },
      subscriptionTracking: { enable: false } // we inject our own per-org unsubscribe
    }
  });

  if (!result.ok) {
    const sendId = await recordSend({
      orgId: input.orgId,
      identityId: identity.identityId,
      contactId: input.contactId,
      toEmail,
      fromEmail: identity.fromEmail,
      subject: input.subject,
      templateKey: input.templateKey,
      category: input.category,
      status: "failed",
      error: result.error
    });
    return { ok: false, reason: "send_failed", error: result.error, sendId };
  }

  const sendId = await recordSend({
    orgId: input.orgId,
    identityId: identity.identityId,
    contactId: input.contactId,
    toEmail,
    fromEmail: identity.fromEmail,
    subject: input.subject,
    templateKey: input.templateKey,
    category: input.category,
    status: "sent",
    sendgridMessageId: result.messageId,
    metadata: {
      domain_verified: identity.domainVerified,
      using_fallback_domain: identity.usingFallbackDomain
    }
  });

  return { ok: true, sendId, messageId: result.messageId };
}
