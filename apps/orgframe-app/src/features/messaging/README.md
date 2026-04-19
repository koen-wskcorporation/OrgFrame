# Messaging — multi-tenant outbound email

Infrastructure for orgs to send email to their own contacts. Distinct from
platform transactional email (auth, password reset) in `src/shared/email/`.

## What's in the box

| Concern | File | Notes |
| --- | --- | --- |
| Send pipeline | `tenant-email/send.ts` | `sendTenantEmail({ orgId, to, subject, html })` — resolves identity → checks suppression → reserves quota slot → injects unsubscribe footer + List-Unsubscribe headers → sends via SendGrid → logs |
| Sender identity | `tenant-email/identity.ts` | Per-org `from` with fallback to `<org-slug>@orgframe.app` until domain is verified |
| Domain auth | `tenant-email/domain-auth.ts` | Wraps SendGrid `/v3/whitelabel/domains` API — create, validate, delete |
| Suppression | `tenant-email/suppression.ts` | Per-org list in `messaging.suppressions` — scoped so Org A unsubscribe doesn't block Org B |
| Unsubscribe tokens | `tenant-email/unsubscribe.ts` | HMAC-signed, stateless, 2-year TTL |
| Quota | `tenant-email/quota.ts` | Atomic daily-cap reservation via `messaging.try_reserve_send_slot` RPC |
| Event ingest | `tenant-email/event-ingest.ts` | SendGrid Event Webhook → `messaging.events` + auto-suppress on bounce/spam |
| Send audit | `tenant-email/logging.ts` | Every attempt recorded in `messaging.sends` |
| Templates | `templates/tenant-layout.tsx` | Base layout with `{{UNSUBSCRIBE_URL}}` / `{{ORG_NAME}}` markers |

## Env vars

Add to `.env.local` and Vercel:

```
# Shared with platform email
SENDGRID_API_KEY=SG.xxx

# Tenant-specific
EMAIL_DEFAULT_TENANT_DOMAIN=orgframe.app       # fallback sender subdomain
EMAIL_UNSUBSCRIBE_SECRET=<random 32+ char string>   # HMAC key for unsubscribe tokens
EMAIL_DEFAULT_DAILY_CAP=1000                        # per-org daily send cap (integer)
SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY=<base64 or PEM>   # from SendGrid Event Webhook settings
```

## SendGrid setup

1. **Event Webhook** → SendGrid → Settings → Mail Settings → Event Webhook.
   - URL: `https://<platform-host>/api/webhooks/sendgrid/events`
   - Enable all events you care about (delivered, open, click, bounce, dropped, spamreport, unsubscribe, group_unsubscribe).
   - Enable Signed Event Webhook Requests. Copy the Verification Key into `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`.

2. **Fallback subdomain** — authenticate `orgframe.app` once as the platform-default sending subdomain so all "fallback" sends are DKIM-signed. This is a one-time action outside this repo (SendGrid dashboard → Sender Authentication → Authenticate Your Domain).

3. **Per-org domain authentication** is created on demand when an org adds their domain (via `createDomainAuthentication` → org copies the returned DNS records into their DNS → org clicks "verify" → `validateDomainAuthentication` runs).

## Sending from app code

```ts
import { sendTenantEmail } from "@/src/features/messaging/tenant-email/send";

const result = await sendTenantEmail({
  orgId,
  to: contact.email,
  contactId: contact.id,
  subject: "Practice moved to Thursday",
  html: renderedHtml,           // render a React Email template to HTML first
  templateKey: "practice_update",
  category: "scheduling"
});

if (!result.ok) {
  // result.reason: "suppressed" | "quota_exceeded" | "send_failed" | "identity_unresolved"
}
```

The send pipeline automatically:
- Rejects suppressed addresses (no send, audit row written).
- Rejects over-quota sends (no send, audit row written).
- Injects `{{UNSUBSCRIBE_URL}}` / `{{ORG_NAME}}` into the HTML, or appends a default footer if markers absent.
- Adds RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post` headers so Gmail/Apple Mail show the native unsubscribe chip.
- Stamps `customArgs.org_id` so the event webhook can route events back.

## What's intentionally NOT built yet

- **UI** for domain management, template composer, contact lists, campaign scheduling.
- **Merge fields / personalization engine** for org-authored content.
- **Scheduled / throttled bulk sends** — today it's one-at-a-time. Add a queue + worker when volume demands.
- **Dedicated IPs / IP warm-up** — on one shared pool until an org's volume justifies it ($80+/mo per dedicated IP).
- **Reply handling** — inbound mail isn't processed (see `communications/` for the inbox feature; wire the two together later).
