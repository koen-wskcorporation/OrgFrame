import "server-only";

import { render } from "@react-email/render";
import { createElement } from "react";
import { sendEmail } from "./client";
import PasswordResetEmail from "./templates/password-reset";
import SignupConfirmationEmail from "./templates/signup-confirmation";
import MagicLinkEmail from "./templates/magic-link";
import InviteEmail from "./templates/invite";
import EmailChangeEmail from "./templates/email-change";

export type SupabaseEmailHookPayload = {
  user: {
    id: string;
    email: string;
    new_email?: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

function buildActionUrl(payload: SupabaseEmailHookPayload, opts?: { useNewHash?: boolean }): string {
  const { site_url, token_hash, token_hash_new, email_action_type, redirect_to } = payload.email_data;
  const hash = opts?.useNewHash ? (token_hash_new ?? token_hash) : token_hash;
  const base = site_url.replace(/\/$/, "");
  const params = new URLSearchParams({
    token_hash: hash,
    type: email_action_type,
    redirect_to: redirect_to
  });
  return `${base}/auth/callback?${params.toString()}`;
}

type RenderedEmail = { subject: string; html: string; category: string };

export async function renderEmailFromHook(payload: SupabaseEmailHookPayload): Promise<RenderedEmail | null> {
  const { email_action_type, token, token_new } = payload.email_data;
  const actionUrl = buildActionUrl(payload);

  switch (email_action_type) {
    case "signup": {
      const html = await render(createElement(SignupConfirmationEmail, { actionUrl, token }));
      return { subject: "Confirm your OrgFrame email", html, category: "auth.signup" };
    }
    case "recovery": {
      const html = await render(createElement(PasswordResetEmail, { actionUrl, token }));
      return { subject: "Reset your OrgFrame password", html, category: "auth.recovery" };
    }
    case "magiclink": {
      const html = await render(createElement(MagicLinkEmail, { actionUrl, token }));
      return { subject: "Your OrgFrame sign-in link", html, category: "auth.magiclink" };
    }
    case "invite": {
      const html = await render(createElement(InviteEmail, { actionUrl, token }));
      return { subject: "You've been invited to OrgFrame", html, category: "auth.invite" };
    }
    case "email_change":
    case "email_change_new": {
      const useNewHash = email_action_type === "email_change_new";
      const url = buildActionUrl(payload, { useNewHash });
      const html = await render(
        createElement(EmailChangeEmail, {
          actionUrl: url,
          token: useNewHash ? (token_new ?? token) : token,
          newEmail: payload.user.new_email
        })
      );
      return { subject: "Confirm your new OrgFrame email", html, category: "auth.email_change" };
    }
    default:
      return null;
  }
}

export async function handleSupabaseEmailHook(payload: SupabaseEmailHookPayload): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const recipient = payload.email_data.email_action_type === "email_change_new"
    ? (payload.user.new_email ?? payload.user.email)
    : payload.user.email;

  if (!recipient) {
    return { ok: false, error: "missing_recipient" };
  }

  const rendered = await renderEmailFromHook(payload);
  if (!rendered) {
    return { ok: true, skipped: true };
  }

  const result = await sendEmail({
    to: recipient,
    subject: rendered.subject,
    html: rendered.html,
    categories: [rendered.category],
    customArgs: {
      user_id: payload.user.id,
      email_action_type: payload.email_data.email_action_type
    }
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
